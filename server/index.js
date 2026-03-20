const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());

// Serve the static frontend build
app.use(express.static(path.join(__dirname, '../client/dist')));

// Fallback to index.html for React routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const PORT = process.env.PORT || 4000;

// Game State
// rooms[roomId] = {
//   players: { [socketId]: { id, name, score, choice, playAgainVote } },
//   roundCount: 1,
//   status: "waiting" | "playing" | "round_reveal" | "game_over",
//   host: socketId
// }
const rooms = {};

// Helper: generate 4-character random code
function generateRoomCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Helper: resolve round winner
// 0: draw, 1: player 1 wins, 2: player 2 wins
function resolveRound(choice1, choice2) {
  if (choice1 === choice2) return 0;
  if (
    (choice1 === "rock" && choice2 === "scissors") ||
    (choice1 === "paper" && choice2 === "rock") ||
    (choice1 === "scissors" && choice2 === "paper")
  ) {
    return 1;
  }
  return 2;
}

function emitRoomState(roomId) {
  if (rooms[roomId]) {
    io.to(roomId).emit("roomState", rooms[roomId]);
  }
}

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("createRoom", ({ name }) => {
    let roomId = generateRoomCode();
    while (rooms[roomId]) {
      roomId = generateRoomCode();
    }

    rooms[roomId] = {
      players: {
        [socket.id]: { id: socket.id, name, score: 0, choice: null, playAgainVote: false },
      },
      roundCount: 1,
      status: "waiting", // waiting for another player
      host: socket.id,
      history: [], // store results of each round: { p1: socketId, p2: socketId, winner: socketId | null }
    };

    socket.join(roomId);
    socket.roomId = roomId;

    socket.emit("roomCreated", { roomId });
    emitRoomState(roomId);
  });

  socket.on("joinRoom", ({ roomId, name }) => {
    roomId = roomId.toUpperCase();
    const room = rooms[roomId];
    if (!room) {
      return socket.emit("error", "Room not found");
    }

    const playerIds = Object.keys(room.players);
    if (playerIds.length >= 2) {
      return socket.emit("error", "Room is full");
    }

    room.players[socket.id] = { id: socket.id, name, score: 0, choice: null, playAgainVote: false };
    room.status = "playing";

    socket.join(roomId);
    socket.roomId = roomId;

    socket.emit("roomJoined", { roomId });
    emitRoomState(roomId);
  });

  socket.on("makeChoice", ({ choice }) => {
    const roomId = socket.roomId;
    if (!roomId) return;
    const room = rooms[roomId];
    if (!room || room.status !== "playing") return;

    const player = room.players[socket.id];
    if (player && !player.choice) {
      player.choice = choice;
      emitRoomState(roomId);

      // Check if both players made their choices
      const playerIds = Object.keys(room.players);
      const allChosen = playerIds.length === 2 && playerIds.every((id) => room.players[id].choice !== null);

      if (allChosen) {
        room.status = "round_reveal";
        emitRoomState(roomId);

        // Resolve Round after a short delay for reveal animation
        setTimeout(() => {
          const p1Id = playerIds[0];
          const p2Id = playerIds[1];
          const p1Choice = room.players[p1Id].choice;
          const p2Choice = room.players[p2Id].choice;

          const winner = resolveRound(p1Choice, p2Choice);
          let roundWinnerId = null;

          if (winner === 1) {
            room.players[p1Id].score += 1;
            roundWinnerId = p1Id;
          } else if (winner === 2) {
            room.players[p2Id].score += 1;
            roundWinnerId = p2Id;
          }

          room.history.push({
            winner: roundWinnerId,
            p1Choice,
            p2Choice,
          });

          // Check if match over (first to 3)
          if (room.players[p1Id].score === 3 || room.players[p2Id].score === 3) {
            room.status = "game_over";
          } else {
            // Reset for next round
            room.players[p1Id].choice = null;
            room.players[p2Id].choice = null;
            room.roundCount += 1;
            room.status = "playing";
          }

          emitRoomState(roomId);
        }, 3000); // 3 seconds reveal delay
      }
    }
  });

  socket.on("playAgain", () => {
    const roomId = socket.roomId;
    if (!roomId) return;
    const room = rooms[roomId];
    if (!room || room.status !== "game_over") return;

    const player = room.players[socket.id];
    if (player) {
      player.playAgainVote = true;
      emitRoomState(roomId);

      const playerIds = Object.keys(room.players);
      const allVoted = playerIds.length === 2 && playerIds.every((id) => room.players[id].playAgainVote);

      if (allVoted) {
        // Reset room state
        playerIds.forEach((id) => {
          room.players[id].score = 0;
          room.players[id].choice = null;
          room.players[id].playAgainVote = false;
        });
        room.roundCount = 1;
        room.status = "playing";
        room.history = [];
        emitRoomState(roomId);
      }
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    const roomId = socket.roomId;
    if (roomId && rooms[roomId]) {
      // If a player disconnects, just remove the room or reset to waiting
      // For simplicity, we drop the other player and delete the room unless it's just the host leaving empty room
      io.to(roomId).emit("error", "Opponent disconnected.");
      delete rooms[roomId];
    }
  });
});

server.listen(PORT, () => {
  console.log('Server is running on port', PORT);
});
