// Import Socket.IO client
const socket = io("https://watch-togethertest.onrender.com"); // Update the URL as per your server

const peers = {}; // Store peer connections
let localStream; // Store the local video stream

// Connection established
socket.on("connect", () => {
  console.log("Connected to Socket.IO server with ID:", socket.id);
});

const videoGrid = document.getElementById("displayvideocalls");

const apiKey = 'AIzaSyDb2q13EkVi9ae2FRym4UBqyoOVKbe-Ut4';
const searchbar = document.getElementById('searchbar');
const suggestions = document.getElementById('suggestions');
let player; let isPlaying; let videoLoaded = false; let currentVideoId = null;
let currentVideoTime = 0; let videoloadedready = false; let lastSentTime = 0;
const DEBOUNCE_TIME = 300;

const videoPlayer = document.getElementById('videoPlayer');
const videoBar = document.getElementById('videoBar');
const playPauseIcon = document.getElementById('playPauseIcon');
const fullScreenBtn = document.getElementById('fullScreen');
const videoContainer = document.getElementById('video-container');
const videoPlayerContainer = document.getElementById('videoPlayer').parentElement;
const overlay = document.createElement('div'); // Create an overlay to intercept clicks
const playbackSpeedMenu = document.getElementById('playbackSpeed-menu');

searchbar.disabled = true; 

// Function to extract room ID from URL
function getRoomIdFromURL() {
  const pathParts = window.location.pathname.split("/");
  return pathParts.length > 1 && pathParts[1] ? pathParts[1] : null;
}

// Room-specific functionality
const roomId = getRoomIdFromURL();

if (roomId) {
  console.log(`Joined room: ${roomId}`);
  searchbar.disabled = false; 

  
  // Emit join room event
  const participantName = generateRandomName(); // Ensure this function is implemented
  const myPeer = new Peer(undefined, {
    host: 'peerjs-server-gdyx.onrender.com',
    secure: true,
    port: 443,
    path: '/peerjs',
  });


  myPeer.on("open", id => {
    console.log("befor emit join_room")
    socket.emit("join-room", roomId, id);
    console.log("after emit room_join")
  })

  

  // Room-specific UI updates
  updateRoomUI(roomId);
  const myVideo = document.createElement('video');
  myVideo.muted = true;

  navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true
  }).then(stream => {
    addVideoStream(myVideo, stream)

    myPeer.on('call', call => {
      call.answer(stream)
      const video = document.createElement('video')
      call.on('stream', userVideoStream => {
        addVideoStream(video, userVideoStream)
      })
    })
    
    // Listen for new user joining the room
    socket.on("user-connected", userId => {
      if (userId !== myPeer.id) {  // Check if the userId is not the same as the current user's ID
        connectToNewUser(userId, stream);
      }
      displayNotification(`${userId} has joined the room.`);
    });
  })

  socket.on('user-disconnected', userId => {
    console.log("User disconnected:", { roomId, userId }); // Debugging
    if (peers[userId]) {
      peers[userId].close();
      delete peers[userId];
    }
    const individualsVideo = document.querySelector(`.individualsVideo[data-user-id="${userId}"]`);
    if (individualsVideo) {
      individualsVideo.remove();
      displayNotification(`${userId} has left the room.`);
    }
  })

  function connectToNewUser(userId, stream){
    const call = myPeer.call(userId, stream);
    const video = document.createElement('video');
    call.on("stream", userVideoStream => {
      addVideoStream(video, userVideoStream, userId);
    })
    call.on('close', () => {
       const individualsVideo = document.querySelector(`.individualsVideo[data-user-id="${userId}"]`);
      if (individualsVideo) {
        individualsVideo.remove();
      }
      video.remove()
    })

    peers[userId] = call
    console.log(peers);
  }
  
  function addVideoStream(video, stream, userId) {
  video.srcObject = stream;
  video.addEventListener('loadedmetadata', () => {
    video.play();
  });

    // Check if the video already exists in the videoGrid to avoid duplicates and empty divs
    if (![...videoGrid.getElementsByTagName('video')].some(v => v.srcObject === stream)) {
      const individualsVideo = document.createElement('div');
      individualsVideo.classList.add('individualsVideo');
      individualsVideo.setAttribute("data-user-id", userId);
      videoGrid.append(individualsVideo);
      individualsVideo.append(video);
    }
  }
  // Event listener for the search bar
  searchbar.addEventListener('input', async (e) => {
    const query = e.target.value.trim();
    if (query.length > 0) {
      const results = await fetchSuggestions(query);
      displaySuggestions(results);
    } else {
      suggestions.innerHTML = ''; // Clear suggestions when the input is empty
    }
  });

  // Listen for video-sync event to sync the video across users
  socket.on('video-sync', (videoId, currentTime, isPlaying) => {
    if (currentVideoId === videoId) return;  // Don't reload if the video is already the same
  
    console.log(`Syncing video for all users: ${videoId}`);
    loadVideo(videoId);
  });
  
  socket.on('video-seeked', (roomId, videoBarValue) => {
    const newTime = videoBarValue;
    player.seekTo(newTime, true);
    console.log(`Seeked video to ${newTime}`);
  });
  
  socket.on('video-paused', (roomId, currentTime) => {
    player.pauseVideo();
    player.seekTo(currentTime, true);
    console.log('Video paused');
  });
  
  socket.on('video-played', (roomId, currentTime) => {
    player.playVideo();
    player.seekTo(currentTime, true);
    console.log('Video played');
  });

  
} else {
  console.log("No room detected in the URL. Displaying default interface.");
}


// Helper: Update room-specific UI
function updateRoomUI(roomId) {
  const createJoinBtnDiv = document.querySelector(".creatJoinBtn");
  createJoinBtnDiv.innerHTML = `
    <span id="roomIdDisplay">Room ID: ${roomId}</span>
    <i class="fa-solid fa-copy" id="copyRoomId" style="cursor: pointer; color: yellow;"></i>
  `;

  // Enable copying Room ID
  document.getElementById("copyRoomId").addEventListener("click", () => {
    navigator.clipboard.writeText(roomId).then(() => {
      const copyMessage = document.createElement("div");
      copyMessage.textContent = "Room ID copied to clipboard!";
      copyMessage.style.position = "fixed";
      copyMessage.style.bottom = "20px";
      copyMessage.style.right = "20px";
      copyMessage.style.backgroundColor = "#4CAF50";
      copyMessage.style.color = "#fff";
      copyMessage.style.padding = "10px";
      copyMessage.style.borderRadius = "5px";
      document.body.appendChild(copyMessage);
      setTimeout(() => copyMessage.remove(), 3000);
    });
  });
}

// Helper: Display notification
function displayNotification(message) {
  const notification = document.createElement("div");
  notification.textContent = message;
  notification.style.position = "fixed";
  notification.style.top = "10px";
  notification.style.right = "10px";
  notification.style.backgroundColor = "#f0ad4e";
  notification.style.color = "#fff";
  notification.style.padding = "10px";
  notification.style.borderRadius = "5px";
  document.body.appendChild(notification);
  setTimeout(() => notification.remove(), 3000);
}


// Display Local Video
// 📌 CREATE ROOM EVENT LISTENER
const createRoomButton = document.getElementById("create");
const createRoomPopup = document.getElementById("createRoomPopup");
const createRoomConfirmButton = document.getElementById("createRoomConfirm");
const closeCreateRoomPopupButton = document.getElementById("closeCreateRoomPopup");

// Show Room Creation Popup
createRoomButton.addEventListener("click", () => {
  createRoomPopup.style.display = "grid"; // Show the popup
});

// Room Creation
async function createRoom() {
  const roomName = document.getElementById("roomName").value.trim();
  const adminName = document.getElementById("adminName").value.trim();
  if (!roomName || !adminName) {
    alert("Please enter both Room Name and Admin Name.");
    return;
  }

  const roomId = generateRoomId();

  try {
    const response = await fetch("/create_room", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room_id: roomId, room_name: roomName, admin_name: adminName }),
    });

    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();

    if (data.message === "Room created successfully") {
      window.location.href = `/${roomId}`; // Redirect to room
    }
  } catch (error) {
    console.error("Error creating room:", error);
  }
}

// Confirm Room Creation
createRoomConfirmButton.addEventListener("click", createRoom);

/**
 * Update UI after room creation
 */
function updateUIAfterRoomCreation(roomId) {
  // Replace buttons with room details
  const createJoinBtnDiv = document.querySelector(".creatJoinBtn");
  createJoinBtnDiv.innerHTML = `
    <span id="roomIdDisplay">Room ID: ${roomId}</span>
    <i class="fa-solid fa-copy" id="copyRoomId" style="cursor: pointer; color: yellow;"></i>
  `;

  // Enable copying Room ID
  document.getElementById("copyRoomId").addEventListener("click", () => {
            navigator.clipboard.writeText(roomId).then(() => {
              // Toast-style notification
              const copyMessage = document.createElement("div");
              copyMessage.textContent = "Room ID copied to clipboard!";
              copyMessage.style.position = "fixed";
              copyMessage.style.bottom = "20px";
              copyMessage.style.right = "20px";
              copyMessage.style.backgroundColor = "#4CAF50";
              copyMessage.style.color = "#fff";
              copyMessage.style.padding = "10px";
              copyMessage.style.borderRadius = "5px";
              document.body.appendChild(copyMessage);
              setTimeout(() => copyMessage.remove(), 3000);
            });
          });

  // Clear and hide popup
  createRoomPopup.style.display = "none";
  document.getElementById("roomName").value = "";
  document.getElementById("adminName").value = "";
}

closeCreateRoomPopupButton.addEventListener("click", () => {
  createRoomPopup.style.display = "none"; // Close the create room popup
  document.getElementById("roomName").value = "";
  document.getElementById("adminName").value = "";
});


// 📌 JOIN ROOM POPUP HANDLER
const joinButton = document.getElementById("join");
const joinPopup = document.getElementById("join-popup");
const closePopupButton = document.getElementById("closePopup");
const joinRoomButton = document.getElementById("joinRoom");
const joinRoomIdInput = document.getElementById("joinRoomId");
const joinErrorText = document.getElementById("joinError");

// Show Join Popup
joinButton.addEventListener("click", () => {
  joinPopup.style.display = "grid";
});

// Close Join Popup
closePopupButton.addEventListener("click", () => {
  joinPopup.style.display = "none";
  joinErrorText.style.display = "none";
  joinRoomIdInput.value = "";
});

// Join Room
async function joinRoom(roomId, participantName) {
  try {
    const response = await fetch("/join_room", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room_id: roomId, participant_name: participantName }),
    });

    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();

    if (data.message === "Joined room successfully") {
      socket.emit("join_room", { room_id: roomId, participant_name: participantName });
      window.location.href = `/${roomId}`;
    }
  } catch (error) {
    console.error("Error joining room:", error);
  }
}

// Handle join room button
joinRoomButton.addEventListener("click", async () => {
  const roomId = joinRoomIdInput.value.trim();

  // Validation
  if (!roomId) {
    joinErrorText.textContent = "Please enter a Room ID.";
    joinErrorText.style.display = "block";
    return;
  }

  const participantName = generateRandomName(); // Ensure this function is implemented
  joinErrorText.style.display = "none"; // Clear any previous error message
  joinRoom(roomId, participantName); // Ensure implementation exists
  joinPopup.style.display = "none";
  joinRoomIdInput.value = "";
});

// 📌 Utility Function: Copy to Clipboard
function copyToClipboard(text) {
  navigator.clipboard
    .writeText(text)
    .then(() => alert("Room ID copied to clipboard!"))
    .catch((err) => console.error("Error copying text:", err));
}


// 📌 Generate Random Room ID
function generateRoomId() {
  return Math.random().toString(36).substr(2, 9); // Random 9 character ID
}

function generateRandomName() {
  const adjectives = ["Quick", "Bright", "Brave", "Calm", "Sharp", "Wise"];
  const nouns = ["Lion", "Tiger", "Falcon", "Eagle", "Wolf", "Bear"];
  return `${adjectives[Math.floor(Math.random() * adjectives.length)]} ${
    nouns[Math.floor(Math.random() * nouns.length)]
  }`;
}



// Function to fetch suggestions from YouTube API
async function fetchSuggestions(query) {
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=20&q=${encodeURIComponent(
    query
  )}&type=video&key=${apiKey}`;
  const response = await fetch(url);
  console.log(response);
  const data = await response.json();
  console.log(data);
  return data.items;
}

// Display suggestions below the search bar
function displaySuggestions(items) {
  suggestions.innerHTML = '';
  items.forEach(item => {
    const li = document.createElement('li');
    const videoThumbnail = document.createElement('img');
    videoThumbnail.src = `${item.snippet.thumbnails.medium.url}`;
    const videoTitle = document.createElement(`div`);
    videoTitle.classList.add("video-title");
    videoTitle.textContent = item.snippet.title;
    li.appendChild(videoThumbnail);
    li.appendChild(videoTitle);
    // li.textContent = item.snippet.title;
    li.setAttribute('data-video-id', item.id.videoId);
    li.addEventListener('click', () => loadVideo(item.id.videoId));
    suggestions.appendChild(li);
  });
}

// Load YouTube video in the iframe
function loadVideo(videoId) {
  if (currentVideoId === videoId) return;
  const volumeBar = document.getElementById('volumeBar');
  overlay.style.position = 'absolute';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100%';
  overlay.style.height = '100%';
  overlay.style.zIndex = '10'; // Ensure it's above the video
  overlay.style.background = 'transparent'; // Fully transparent overlay
  videoContainer.appendChild(overlay); // Add the overlay to the video container

  currentVideoId = videoId; // Update to the new video ID
  
  // Emit to server to broadcast the video load event
  socket.emit('video-loaded', { roomId, videoId });
  
  // videoPlayer.document.close();
  if (player){
    player.g = null;
  }
  videoPlayer.src = `about:blank`;
  videoPlayer.src = `https://www.youtube.com/embed/${videoId}?enablejsapi=1&autoplay=1`;
  let isPlaying = true;
  suggestions.innerHTML = '';
  let isUserInteracting = false; // Track if the user is interacting with the videoBar
  let syncInterval; // To store the interval ID
  let isPauseEventSent = false;
  let lastPlayerState = null;
  let videoloadedready = true;
  // Initialize the YouTube Player API
  player = new YT.Player(videoPlayer, {
    videoId: videoId,
    events: {
      onReady: (event) => {
        // Start playing the video when ready
        event.target.playVideo();
        
        // Sync the videoBar with the video's progress
        const duration = event.target.getDuration();
        videoBar.max = duration;
        videoBar.value = 0; // Start at 0
        currentVideoTime = 0;
        
        // Set the initial volume to 50%
        player.setVolume(50);
        volumeBar.value = 50; // Sync the volume bar with the initial volume
        
        // Populate speed menu once the video is ready
        populatePlaybackSpeedMenu();
        syncInterval = setInterval(() => {
          if (!isUserInteracting && player && typeof player.getCurrentTime === 'function') {
            const currentTime = player.getCurrentTime();
            videoBar.value = currentTime;
          }
        }, 500); // Update every 500ms
      },
      onStateChange: (event) => {
        const currentState = event.data;
        
        // Check for PAUSED state
        if (event.data === YT.PlayerState.ENDED) {
          clearInterval(syncInterval); // Stop syncing when the video ends
        }
      },
    },
  });

  // Add event listener to the full screen button
  fullScreenBtn.addEventListener('click', toggleFullScreen);

  window.setVolume = function (value) {
    if (player && typeof player.setVolume === 'function') {
      player.setVolume(value); // Set the player volume to the new value
    }
  };

  // Update video progress when the user interacts with the videoBar
  videoBar.addEventListener('mousedown', () => {
    isUserInteracting = true; // Pause syncing when the user starts interacting
  });

  videoBar.addEventListener('change', () => {
    if (player && typeof player.seekTo === 'function') {
      const newTime = videoBar.value;
      if (Math.abs(newTime - lastSentTime) > 1) {
        lastSentTime = newTime; // Update last sent time
        player.seekTo(newTime, true);
        socket.emit('video-seek', { roomId, videoBarValue: newTime });
      }
    }
  });

  videoBar.addEventListener('mouseup', () => {
    isUserInteracting = false; // Resume syncing when the user stops interacting
  });

  videoBar.addEventListener('touchstart', () => {
    isUserInteracting = true; // Pause syncing for touch interaction
  });

  videoBar.addEventListener('touchend', () => {
    isUserInteracting = false; // Resume syncing after touch interaction
  });

  playPauseIcon.addEventListener('click', () => {
    if (player) {
      if (player.getPlayerState() === 1) {
        playPauseIcon.classList.remove('fa-pause');
        playPauseIcon.classList.add('fa-play');
        lastPlayerState = YT.PlayerState.PAUSED; // Update state manually
        socket.emit('video-pause', {roomId, currentTime: player.getCurrentTime()});
        console.log('pause emite')
        player.pauseVideo();
      } else {
        playPauseIcon.classList.remove('fa-play');
        playPauseIcon.classList.add('fa-pause');
        lastPlayerState = YT.PlayerState.PLAYING; // Update state manually
        socket.emit('video-play', {roomId, currentTime: player.getCurrentTime()});
        console.log('playe emite')
        player.playVideo();
      }
      
    }
  });

}

function toggleFullScreen() {
  if (!document.fullscreenElement) {
    videoPlayerContainer.requestFullscreen?.();
    fullScreenBtn.textContent = 'Exit full screen';
  } else {
    document.exitFullscreen?.();
    fullScreenBtn.textContent = 'Full screen';
  }
}

document.addEventListener('fullscreenchange', () => {
  if (document.fullscreenElement) {
    overlay.style.position = 'fixed';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
  } else {
    overlay.style.position = 'absolute';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
  }
});

function populatePlaybackSpeedMenu() {
  const availableSpeeds = player.getAvailablePlaybackRates(); // Get available playback rates

  // Clear the existing menu
  playbackSpeedMenu.innerHTML = '';

  // Populate menu with available playback speeds
  availableSpeeds.forEach((speed) => {
    const speedItem = document.createElement('li');
    speedItem.textContent = `${speed}x`; // Set the speed text (e.g., '1x', '1.5x')
    speedItem.addEventListener('click', () => {
      setPlaybackSpeed(speed); // Add click event to set speed
    });
    playbackSpeedMenu.appendChild(speedItem);
  });
}

// Function to set playback speed
function setPlaybackSpeed(speed) {
  if (player && typeof player.setPlaybackRate === 'function') {
    player.setPlaybackRate(speed); // Set the playback speed
    console.log(`Playback speed set to: ${speed}`);
  }
}

