// Isolated behavior checks; does not connect to Discord.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const { createRequire } = require("node:module");
const load = process.env.VENCORD_DIR ? createRequire(path.resolve(process.env.VENCORD_DIR, "package.json")) : require;
const ts = load("typescript");
const source = fs.readFileSync(path.join(__dirname, "..", "index.ts"), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function fixture(initial = []) {
    const state = { channel: "vc", streams: initial, active: [], calls: [], events: [], opened: [], popouts: [], layouts: [], pip: { id: "video" }, config: { displayMode: "mini" }, timers: new Map(), listeners: new Set() };
    const common = {
        ApplicationStreamingStore: {
            getAllApplicationStreamsForChannel: id => state.streams.filter(s => s.channelId === id),
            getAllActiveStreams: () => state.active,
            addChangeListener: fn => state.listeners.add(fn),
            removeChangeListener: fn => state.listeners.delete(fn)
        },
        SelectedChannelStore: {
            getVoiceChannelId: () => state.channel,
            addChangeListener: fn => state.listeners.add(fn),
            removeChangeListener: fn => state.listeners.delete(fn)
        },
        UserStore: { getCurrentUser: () => ({ id: "me" }) },
        ChannelStore: { getChannel: id => ({ id }) },
        FluxDispatcher: { dispatch: event => state.events.push(event) }
    };
    let serial = 0;
    const context = {
        exports: {}, Date,
        setTimeout: fn => { state.timers.set(++serial, fn); return serial; },
        clearTimeout: id => state.timers.delete(id),
        require: id => {
            if (id === "@utils/types") return { __esModule: true, default: plugin => plugin, OptionType: { SELECT: 3 } };
            if (id === "@api/Settings") return { definePluginSettings: () => ({ store: state.config }) };
            if (id === "@utils/Logger") return { Logger: class { error() {} } };
            if (id === "@webpack/common") return common;
            if (id === "@webpack") return {
                findByCodeLazy: search => {
                    if (search.includes('STREAM_WATCH')) return stream => state.calls.push(stream.ownerId);
                    if (search.includes('CHANNEL_CALL_POPOUT_WINDOW_OPEN')) return channel => state.popouts.push(channel.id);
                    if (search.includes('POPOUT_WINDOW_CLOSE')) return () => {};
                    if (search.includes('openTextInVoiceIfVoiceChannel')) return channel => state.opened.push(channel);
                    throw new Error(search);
                },
                findByPropsLazy: () => ({ updateLayout: (...args) => state.layouts.push(args) }),
                findStoreLazy: () => ({ get pipVideoWindow() { return state.pip; } })
            };
            throw new Error(id);
        }
    };
    vm.runInNewContext(code, context);
    state.plugin = context.exports.default;
    state.change = () => [...state.listeners].forEach(fn => fn());
    state.flush = () => { const timers = [...state.timers.values()]; state.timers.clear(); timers.forEach(fn => fn()); };
    state.plugin.start();
    return state;
}
const stream = (ownerId = "alice", channelId = "vc") => ({ ownerId, channelId, guildId: "guild", streamType: "guild" });
let count = 0;
function test(name, fn) { fn(); count++; console.log(`PASS ${name}`); }
test("new stream starts once; manually closing does not reopen", () => {
    const s = fixture(); s.streams = [stream()]; s.change(); s.change(); s.flush();
    assert.deepEqual(s.calls, ["alice"]); s.change(); s.flush(); assert.equal(s.calls.length, 1);
});
test("existing streams are a baseline", () => {
    const s = fixture([stream()]); s.change(); s.flush(); assert.equal(s.calls.length, 0);
});
test("own and other-channel streams are ignored", () => {
    const s = fixture(); s.streams = [stream("me"), stream("bob", "other")]; s.change(); s.flush(); assert.equal(s.calls.length, 0);
});
test("watching another person is preserved", () => {
    const s = fixture(); s.active = [stream("bob")]; s.streams = [stream()]; s.change(); s.flush(); assert.equal(s.calls.length, 0);
});
test("manual watching during delay is preserved", () => {
    const s = fixture(); s.streams = [stream()]; s.change(); s.active = [stream("bob")]; s.flush(); assert.equal(s.calls.length, 0);
});
test("channel change cancels pending watch", () => {
    const s = fixture(); s.streams = [stream()]; s.change(); s.channel = "other"; s.change(); s.flush(); assert.equal(s.calls.length, 0);
});
test("ended stream is not watched", () => {
    const s = fixture(); s.streams = [stream()]; s.change(); s.streams = []; s.change(); s.flush(); assert.equal(s.calls.length, 0);
});
test("disabling removes listeners and cancels work", () => {
    const s = fixture(); s.streams = [stream()]; s.change(); s.plugin.stop(); s.flush(); assert.equal(s.calls.length, 0); assert.equal(s.listeners.size, 0);
});
test("simultaneous starts select only the first", () => {
    const s = fixture(); s.streams = [stream(), stream("bob")]; s.change(); s.flush(); assert.deepEqual(s.calls, ["alice"]);
});
test("a stopped and restarted stream is detected", () => {
    const s = fixture([stream()]); s.streams = []; s.change(); s.streams = [stream()]; s.change(); s.flush(); assert.deepEqual(s.calls, ["alice"]);
});
test("large mode opens the voice channel with a large layout", () => {
    const s = fixture(); s.config.displayMode = "large"; s.streams = [stream()]; s.change(); s.flush();
    assert.deepEqual(s.opened, ["vc"]); assert.deepEqual(s.layouts, [["vc", "no-chat", "APP"]]); assert.equal(s.popouts.length, 0);
});
test("mini mode keeps the chat and positions video top right", () => {
    const s = fixture(); s.streams = [stream()]; s.change(); s.flush();
    assert.equal(s.opened.length, 0); assert.equal(s.popouts.length, 0);
    assert.equal(s.events.find(e => e.type === "PICTURE_IN_PICTURE_MOVE").position, "top-right");
});
test("popout mode opens a separate call window without navigating", () => {
    const s = fixture(); s.config.displayMode = "popout"; s.streams = [stream()]; s.change(); s.flush();
    assert.deepEqual(s.popouts, ["vc"]); assert.equal(s.opened.length, 0);
});
test("late mini-player creation is handled, and stop cancels retries", () => {
    const s = fixture(); s.pip = null; s.streams = [stream()]; s.change(); s.flush();
    assert.equal(s.timers.size, 1); s.pip = { id: "late" }; s.flush(); assert.equal(s.events[0].id, "late");
    const t = fixture(); t.pip = null; t.streams = [stream()]; t.change(); t.flush(); t.plugin.stop(); assert.equal(t.timers.size, 0);
});
console.log(`${count} checks passed (mock stores; live playback not tested).`);
