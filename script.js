// Firebase Configuration (Replace with your actual keys)
const firebaseConfig = {
    apiKey: "AIzaSyCgswS8AZObwKQjxZooWWJHf4b1m1rvorA",
    authDomain: "t2upload.firebaseapp.com",
    databaseURL: "https://t2upload-default-rtdb.firebaseio.com",
    projectId: "t2upload",
    storageBucket: "t2upload.appspot.com",
    messagingSenderId: "1000887477924",
    appId: "1:1000887477924:web:522232d054b9b7ce2ea831",
    measurementId: "G-75ZZL6BWVH"
};

firebase.initializeApp(firebaseConfig);
const database = firebase.database();

const startPage = document.getElementById('start-page');
const createPage = document.getElementById('create-page');
const joinPage = document.getElementById('join-page');
const meetingRoom = document.getElementById('meeting-room');

const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomBtn = document.getElementById('join-room-btn');
const startMeetingBtn = document.getElementById('start-meeting-btn');
const joinMeetingBtn = document.getElementById('join-meeting-btn');
const hangupBtn = document.getElementById('hangup-btn');
const fullscreenBtn = document.getElementById('fullscreen-btn'); // New: Fullscreen button

const creatorEmail = document.getElementById('creator-email');
const creatorPassword = document.getElementById('creator-password');
const joinPassword = document.getElementById('join-password');
const roomInfo = document.getElementById('room-info');

const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');

let localStream;
let peerConnection;
let roomId;

// --- Helper Functions to switch pages ---
function showPage(pageId) {
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    document.getElementById(pageId).classList.add('active');
}

// --- Event Listeners ---
createRoomBtn.addEventListener('click', () => {
    showPage('create-page');
});

joinRoomBtn.addEventListener('click', () => {
    showPage('join-page');
});

startMeetingBtn.addEventListener('click', async () => {
    if (creatorEmail.value && creatorPassword.value) {
        roomId = Date.now().toString();
        await setupRoom(roomId, creatorPassword.value);
        roomInfo.innerText = `Room ID: ${roomId}`;
        showPage('meeting-room');
    } else {
        alert('Please enter your email and a password.');
    }
});

joinMeetingBtn.addEventListener('click', async () => {
    const enteredPassword = joinPassword.value;
    const roomsRef = database.ref('rooms');

    roomsRef.once('value', async (snapshot) => {
        const rooms = snapshot.val();
        let foundRoomId = null;

        for (const id in rooms) {
            if (rooms[id].password === enteredPassword) {
                foundRoomId = id;
                break;
            }
        }

        if (foundRoomId) {
            roomId = foundRoomId;
            await joinRoom(roomId);
            roomInfo.innerText = `Joined Room: ${roomId}`;
            showPage('meeting-room');
        } else {
            alert('Incorrect password or room does not exist.');
        }
    });
});

hangupBtn.addEventListener('click', () => {
    if (peerConnection) {
        peerConnection.close();
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    database.ref('rooms/' + roomId).remove();
    showPage('start-page');
});

fullscreenBtn.addEventListener('click', toggleFullScreen);

// --- New: Fullscreen Functionality ---
function toggleFullScreen() {
    const meetingRoomElement = document.getElementById('meeting-room');
    if (!document.fullscreenElement) {
        if (meetingRoomElement.requestFullscreen) {
            meetingRoomElement.requestFullscreen();
        } else if (meetingRoomElement.mozRequestFullScreen) { /* Firefox */
            meetingRoomElement.mozRequestFullScreen();
        } else if (meetingRoomElement.webkitRequestFullscreen) { /* Chrome, Safari & Opera */
            meetingRoomElement.webkitRequestFullscreen();
        } else if (meetingRoomElement.msRequestFullscreen) { /* IE/Edge */
            meetingRoomElement.msRequestFullscreen();
        }
        fullscreenBtn.innerText = 'Exit Full Screen';
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.mozCancelFullScreen) { /* Firefox */
            document.mozCancelFullScreen();
        } else if (document.webkitExitFullscreen) { /* Chrome, Safari & Opera */
            document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) { /* IE/Edge */
            document.msExitFullscreen();
        }
        fullscreenBtn.innerText = 'Full Screen';
    }
}


// --- WebRTC and Firebase Logic ---
const servers = {
    iceServers: [
        {
            urls: 'stun:stun.l.google.com:19302'
        },
    ]
};

async function setupRoom(id, password) {
    const roomRef = database.ref('rooms/' + id);
    await roomRef.set({ password: password });

    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;

    peerConnection = new RTCPeerConnection(servers);
    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    // Handle remote stream
    peerConnection.ontrack = (event) => {
        remoteVideo.srcObject = event.streams[0];
    };

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            roomRef.child('calleeCandidates').push(event.candidate);
        }
    };

    // Create offer
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    await roomRef.child('offer').set({
        type: offer.type,
        sdp: offer.sdp
    });

    // Listen for answer
    roomRef.child('answer').on('value', async (snapshot) => {
        if (snapshot.exists()) {
            const answer = snapshot.val();
            await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        }
    });

    // Listen for ICE candidates from other peer
    roomRef.child('callerCandidates').on('child_added', (snapshot) => {
        const candidate = new RTCIceCandidate(snapshot.val());
        peerConnection.addIceCandidate(candidate);
    });
}

async function joinRoom(id) {
    const roomRef = database.ref('rooms/' + id);

    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;

    peerConnection = new RTCPeerConnection(servers);
    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    // Handle remote stream
    peerConnection.ontrack = (event) => {
        remoteVideo.srcObject = event.streams[0];
    };

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            roomRef.child('callerCandidates').push(event.candidate);
        }
    };

    // Get offer and create answer
    roomRef.child('offer').once('value', async (snapshot) => {
        if (snapshot.exists()) {
            const offer = snapshot.val();
            await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            await roomRef.child('answer').set({
                type: answer.type,
                sdp: answer.sdp
            });
        }
    });

    // Listen for ICE candidates from other peer
    roomRef.child('calleeCandidates').on('child_added', (snapshot) => {
        const candidate = new RTCIceCandidate(snapshot.val());
        peerConnection.addIceCandidate(candidate);
    });
}
