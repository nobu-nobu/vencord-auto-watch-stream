/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";
import { ApplicationStream } from "@vencord/discord-types";
import { findByCodeLazy, findByPropsLazy, findStoreLazy } from "@webpack";
import { ApplicationStreamingStore, ChannelStore, FluxDispatcher, SelectedChannelStore, UserStore } from "@webpack/common";

const settings = definePluginSettings({
    displayMode: {
        type: OptionType.SELECT,
        description: "配信の表示方法（次の自動視聴から反映）",
        options: [
            { label: "Discord内で大きく表示", value: "large" },
            { label: "チャットのまま右上に小さく表示", value: "mini", default: true },
            { label: "別ウィンドウで表示", value: "popout" }
        ]
    }
});

const openChannel = findByCodeLazy("openTextInVoiceIfVoiceChannel", ".preload(") as (channelId: string) => void;
const openPopout = findByCodeLazy('type:"CHANNEL_CALL_POPOUT_WINDOW_OPEN"') as (channel: unknown) => void;
const closePopout = findByCodeLazy('type:"POPOUT_WINDOW_CLOSE"') as (key: string) => void;
const rtcActions = findByPropsLazy("updateLayout", "selectParticipant");
const pipStore = findStoreLazy("PictureInPictureStore");

// Discord's own watch action, including its permission checks and participant focus.
// Verified against the public web client on 2026-09-23. Export names are obfuscated.
const watchStream = findByCodeLazy('type:"STREAM_WATCH"', "forceMultiple") as
    (stream: ApplicationStream, options: { forceFocus: boolean; }) => void;
const logger = new Logger("AutoWatchStream");
let running = false;
let channelId: string | undefined;
let seen = new Set<string>();
let pending: ReturnType<typeof setTimeout> | undefined;
let settlingUntil = 0;
let displayTimer: ReturnType<typeof setTimeout> | undefined;

function displayStream(stream: ApplicationStream) {
    clearTimeout(displayTimer);
    const mode = settings.store.displayMode;
    if (mode === "popout") {
        const channel = ChannelStore.getChannel(stream.channelId);
        if (channel) openPopout(channel);
        return;
    }
    closePopout("DISCORD_CHANNEL_CALL_POPOUT");
    if (mode === "large") {
        rtcActions.updateLayout(stream.channelId, "no-chat", "APP");
        openChannel(stream.channelId);
        return;
    }
    // Discord creates its native PiP asynchronously after the watch action.
    // Leave the selected chat alone; only reposition the native video window.
    const movePip = (attempt: number) => {
        displayTimer = undefined;
        if (!running || SelectedChannelStore.getVoiceChannelId() !== stream.channelId) return;
        try {
            const pip = pipStore.pipVideoWindow;
            if (pip) {
                FluxDispatcher.dispatch({ type: "PICTURE_IN_PICTURE_SHOW", id: pip.id });
                FluxDispatcher.dispatch({ type: "PICTURE_IN_PICTURE_MOVE", id: pip.id, position: "top-right" });
            } else if (attempt < 15) {
                displayTimer = setTimeout(() => movePip(attempt + 1), 200);
            }
        } catch (error) {
            logger.error("Could not position the stream mini-player.", error);
        }
    };
    movePip(0);
}

function key(stream: ApplicationStream) {
    return `${stream.streamType}:${stream.guildId ?? ""}:${stream.channelId}:${stream.ownerId}`;
}

function cancelPending() {
    clearTimeout(pending);
    clearTimeout(displayTimer);
    pending = undefined;
    displayTimer = undefined;
}

function scan() {
    if (!running) return;
    try {
        const nextChannel = SelectedChannelStore.getVoiceChannelId();
        const streams = nextChannel
            ? ApplicationStreamingStore.getAllApplicationStreamsForChannel(nextChannel)
            : [];
        const currentKeys = new Set(streams.map(key));
        // Joining a VC or enabling the plugin establishes a baseline, not a new stream.
        if (nextChannel !== channelId) {
            cancelPending();
            channelId = nextChannel;
            seen = currentKeys;
            settlingUntil = 0;
            return;
        }
        const ownId = UserStore.getCurrentUser()?.id;
        const fresh = streams.find(stream => stream.ownerId !== ownId && !seen.has(key(stream)));
        seen = currentKeys;
        if (!ownId || !nextChannel || !fresh || pending || Date.now() < settlingUntil) return;
        if (ApplicationStreamingStore.getAllActiveStreams().some(stream => stream.ownerId !== ownId)) return;

        const expectedChannel = nextChannel;
        const expectedKey = key(fresh);
        // Let Discord finish its Flux dispatch before issuing the watch action.
        pending = setTimeout(() => {
            pending = undefined;
            if (!running || SelectedChannelStore.getVoiceChannelId() !== expectedChannel) return;
            try {
                const stream = ApplicationStreamingStore.getAllApplicationStreamsForChannel(expectedChannel)
                    .find(candidate => key(candidate) === expectedKey);
                if (!stream || !UserStore.getCurrentUser()) return;
                if (ApplicationStreamingStore.getAllActiveStreams().some(active => active.ownerId !== UserStore.getCurrentUser().id)) return;
                settlingUntil = Date.now() + 8000;
                watchStream(stream, { forceFocus: true });
                try {
                    displayStream(stream);
                } catch (error) {
                    logger.error("Watching started, but the selected display mode could not be applied.", error);
                }
            } catch (error) {
                logger.error("Could not start watching. Please use Discord's Watch Stream button.", error);
            }
        }, 750);
    } catch (error) {
        logger.error("Could not inspect streams; automatic watching has been stopped.", error);
        stop();
    }
}

function stop() {
    running = false;
    cancelPending();
    ApplicationStreamingStore.removeChangeListener(scan);
    SelectedChannelStore.removeChangeListener(scan);
    seen.clear();
    channelId = undefined;
    settlingUntil = 0;
}

export default definePlugin({
    name: "AutoWatchStream",
    description: "参加中のVCで新しく始まった配信を自動視聴します。視聴中の配信は切り替えません。",
    authors: [{ name: "Local user plugin", id: 0n }],
    tags: ["Voice", "Utility"],
    settings,
    start() {
        running = true;
        channelId = undefined;
        scan();
        if (!running) return;
        ApplicationStreamingStore.addChangeListener(scan);
        SelectedChannelStore.addChangeListener(scan);
    },
    stop
});
