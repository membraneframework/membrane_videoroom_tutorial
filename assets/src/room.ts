import {
    addVideoElement,
    getRoomId,
    removeVideoElement,
    setErrorMessage,
    setParticipantsList,
    attachStream,
    setupDisconnectButton,
 } from "./room_ui";

import {
    MembraneWebRTC,
    Peer,
    SerializedMediaEvent,
} from "membrane_rtc_engine";
import {MEDIA_CONSTRAINTS, LOCAL_PEER_ID} from './consts';
import { Push, Socket } from "phoenix";
import { parse } from "query-string";

export class Room {

    private socket;
    private webrtcSocketRefs: string[] = [];
    private webrtcChannel;
    private displayName: String;
    private webrtc: MembraneWebRTC;
    private peers: Peer[] = [];
    private localStream: MediaStream | undefined;

    constructor(){   
        this.socket = new Socket("/socket");
        this.socket.connect();
        const { display_name: displayName } = parse(document.location.search);
        this.displayName = displayName as string;
        window.history.replaceState(null, "", window.location.pathname);
        this.webrtcChannel = this.socket.channel(`room:${getRoomId()}`);
        const socketErrorCallbackRef = this.socket.onError(this.leave);
        const socketClosedCallbackRef = this.socket.onClose(this.leave);
        this.webrtcSocketRefs.push(socketErrorCallbackRef);
        this.webrtcSocketRefs.push(socketClosedCallbackRef);
        this.webrtc = new MembraneWebRTC({callbacks: {
            onSendMediaEvent: (mediaEvent: SerializedMediaEvent) => {
                this.webrtcChannel.push("mediaEvent", { data: mediaEvent });
             },
             onConnectionError: setErrorMessage,
             onJoinSuccess: (peerId, peersInRoom) => {
                this.localStream!.getTracks().forEach((track) =>
                    this.webrtc.addTrack(track, this.localStream!)
                );
             
                this.peers = peersInRoom;
                this.peers.forEach((peer) => {
                    addVideoElement(peer.id, peer.metadata.displayName, false);
                });
                this.updateParticipantsList();
             },
             onJoinError: (metadata) => {
                throw `Peer denied.`;
             },
             onTrackReady: ({ stream, peer, metadata }) => {
                attachStream(stream!, peer.id);
             },
             onTrackAdded: (ctx) => {},
             onTrackRemoved: (ctx) => {},
             onPeerJoined: (peer) => {
                this.peers.push(peer);
                this.updateParticipantsList();
                addVideoElement(peer.id, peer.metadata.displayName, false);
             },
             onPeerLeft: (peer) => {
                this.peers = this.peers.filter((p) => p.id !== peer.id);
                removeVideoElement(peer.id);
                this.updateParticipantsList();
             },
             onPeerUpdated: (ctx) => {},
        }});
        this.webrtcChannel.on("mediaEvent", (event) =>
            this.webrtc.receiveMediaEvent(event.data)
        );
    }
    
    private init = async () => {
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia(
                MEDIA_CONSTRAINTS
            );
        } catch (error) {
            console.error(error);
            setErrorMessage(
                "Failed to setup video room, make sure to grant camera and microphone permissions"
            );
            throw "error";
        }
     
        addVideoElement(LOCAL_PEER_ID, "Me", true);
        attachStream(this.localStream!, LOCAL_PEER_ID);
     
        await this.phoenixChannelPushResult(this.webrtcChannel.join());
     };
 
    public join = async () => {
        try {
            await this.init();
            setupDisconnectButton(() => {
                this.leave();
                window.location.replace("");
            });
            this.webrtc.join({ displayName: this.displayName });
        } catch (error) {
            console.error("Error while joining to the room:", error);
        }
     };
 
    private leave = () => {
        this.webrtc.leave();
        this.webrtcChannel.leave();
        this.socket.off(this.webrtcSocketRefs);
        this.webrtcSocketRefs = [];
     };
 
    private updateParticipantsList = (): void => {
        const participantsNames = this.peers.map((p) => p.metadata.displayName);
     
        if (this.displayName) {
            participantsNames.push(this.displayName);
        }
     
        setParticipantsList(participantsNames);
     };
 
     private phoenixChannelPushResult = async (push: Push): Promise<any> => {
        return new Promise((resolve, reject) => {
            push
            .receive("ok", (response: any) => resolve(response))
            .receive("error", (response: any) => reject(response));
        });
     };
 
 
 //no worries, we will put something into these functions :) 
 }