const express = require("express");
const app = express();
const server = require("http").Server(app);
const io = require("socket.io")(server);
const { Pool } = require("pg");
const path = require("path");
const { PeerServer } = require('peer'); 

const pool = new Pool({
  connectionString: 'postgresql://postgres.pezdqmellmcmewcvssbv:8594@aws-0-ap-south-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false },
});

app.use(express.json());
app.use(express.static("public"));

// Test DB connection
pool.connect()
  .then(() => console.log("Connected to PostgreSQL database"))
  .catch(err => {
    console.error("Database connection failed:", err.message);
    process.exit(1);
  });

const rooms = {}; // Stores room data including the current videoId

// Create Room
app.post("/create_room", async (req, res) => {
  const { room_id, room_name, admin_name } = req.body;
  if (!room_id || !room_name || !admin_name) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const result = await pool.query(
      "INSERT INTO rooms (room_id, room_name, admin_name, participants) VALUES ($1, $2, $3, $4) RETURNING *",
      [room_id, room_name, admin_name, JSON.stringify([])]
    );

    res.status(200).json({ message: "Room created successfully" });
  } catch (err) {
    console.error("Failed to create room:", err.message);
    res.status(500).json({ error: "Failed to create room" });
  }
});

// Join Room
app.post("/join_room", async (req, res) => {
  const { room_id, participant_name } = req.body;
  
  if (!room_id || !participant_name) {
    return res.status(400).json({ error: "Missing required fields" });
  }
  
  try {
    // Check if room exists
    const result = await pool.query("SELECT * FROM rooms WHERE room_id = $1", [room_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Room not found" });
    }

    // Update participants
    const room = result.rows[0];
    const participants = room.participants;
    participants.push(participant_name);
    
    await pool.query("UPDATE rooms SET participants = $1 WHERE room_id = $2", [
      JSON.stringify(participants),
      room_id,
    ]);
    console.log("pool query done");
    res.status(200).json({ message: "Joined room successfully" });
  } catch (err) {
    console.error("Error joining room:", err.message);
    res.status(500).json({ error: "Failed to join room" });
  }
});


// Handle Room Routes
app.get("/:room", async (req, res) => {
  const roomId = req.params.room;

  try {
    const result = await pool.query("SELECT * FROM rooms WHERE room_id = $1", [roomId]);
    if (result.rowCount === 0) {
      return res.status(404).send("Room not found.");
    }
    
    res.sendFile(path.join(__dirname, "public", "index.html"));
  } catch (err) {
    console.error("Failed to load room:", err.message);
    res.status(500).send("Internal server error.");
  }
});

io.on("connection", (socket) => {
  console.log("New connection:", socket.id);

  socket.on("create_room", (data) => {
    console.log("Room created:", data.room_id);
    socket.join(data.room_id);
    rooms[data.room_id] = { videoId: null, currentTime: 0 };
  });

  socket.on("join-room", (roomId, userId) => {
    socket.join(roomId);
    io.to(roomId).emit('user-connected', userId);
    console.log(`User ${userId} joined room ${roomId}`);

    // Send current video and time if any
    if (rooms[roomId] && rooms[roomId].videoId) {
      socket.emit('video-sync', rooms[roomId].videoId, rooms[roomId].currentTime);
    }
    
    socket.on("disconnect", () => {
      io.to(roomId).emit('user-disconnected', userId)
      console.log("User disconnected:", socket.id);
    });
  });
  
    // Store the current video state for each room
    socket.on('video-loaded', (data) => {
      const { roomId, videoId } = data;
      if (!rooms[roomId]) rooms[roomId] = {};
      
      rooms[roomId].videoId = videoId;
      rooms[roomId].currentTime = 0;
      rooms[roomId].isPlaying = false;
      socket.to(roomId).emit('video-sync', videoId, rooms[roomId].currentTime, rooms[roomId].isPlaying);
    });
    
    socket.on('video-seek', (data) => {
      const { roomId, videoBarValue } = data;
      if (!rooms[roomId]) return;
    
      rooms[roomId].currentTime = videoBarValue;
      socket.to(roomId).emit('video-seeked', roomId, videoBarValue);
    });
    
    socket.on('video-pause', (data) => {
      const { roomId, currentTime } = data;
      if (!rooms[roomId]) return;
    
      rooms[roomId].isPlaying = false;
      rooms[roomId].currentTime = currentTime;
      socket.to(roomId).emit('video-paused', roomId, currentTime);
    });
    
    socket.on('video-play', (data) => {
      const { roomId, currentTime } = data;
      if (!rooms[roomId]) return;
    
      rooms[roomId].isPlaying = true;
      rooms[roomId].currentTime = currentTime;
      socket.to(roomId).emit('video-played', roomId, currentTime);
    });


});


server.listen(3000, () => console.log("Server running on port 3000"));
