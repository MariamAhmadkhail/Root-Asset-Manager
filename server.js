require("dotenv").config();
const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");
const session = require("express-session");
const fs = require("fs");
const Groq = require("groq-sdk");

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Groq client
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Middleware
app.use(express.static(path.join(__dirname, "public")));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(
  session({
    secret: "your-secret-key",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false },
  }),
);

// Helper functions for users.json
function readUsers() {
  const usersFilePath = path.join(__dirname, "data", "users.json");
  if (!fs.existsSync(usersFilePath)) {
    fs.writeFileSync(usersFilePath, "[]", "utf8");
  }
  const usersData = fs.readFileSync(usersFilePath, "utf8");
  return JSON.parse(usersData || "[]");
}

function writeUsers(users) {
  const usersFilePath = path.join(__dirname, "data", "users.json");
  fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2), "utf8");
}

// Helper functions for games.json
function readGames() {
  const gamesFilePath = path.join(__dirname, "data", "games.json");
  if (!fs.existsSync(gamesFilePath)) {
    fs.writeFileSync(gamesFilePath, "[]", "utf8");
  }
  const gamesData = fs.readFileSync(gamesFilePath, "utf8");
  return JSON.parse(gamesData || "[]");
}

function writeGames(games) {
  const gamesFilePath = path.join(__dirname, "data", "games.json");
  fs.writeFileSync(gamesFilePath, JSON.stringify(games, null, 2), "utf8");
}

// Routes
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.post("/register", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).send("Username and password are required.");
  }
  const users = readUsers();
  if (users.some((user) => user.username === username)) {
    return res.status(400).send("Username already exists.");
  }
  users.push({ username, password });
  writeUsers(users);
  req.session.user = { username };
  res.redirect("/");
});

app.post("/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).send("Username and password are required.");
  }
  const users = readUsers();
  const user = users.find(
    (user) => user.username === username && user.password === password,
  );
  if (!user) {
    return res.status(400).send("Invalid username or password.");
  }
  req.session.user = { username };
  res.redirect("/");
});

app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/");
});

app.get("/check-auth", (req, res) => {
  if (req.session.user) {
    res.json({ loggedIn: true, username: req.session.user.username });
  } else {
    res.json({ loggedIn: false });
  }
});

app.post("/save-game", (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Not logged in." });
  }
  const { moves, winner, difficulty, personality } = req.body;
  if (!moves || !Array.isArray(moves) || moves.length !== 9) {
    return res.status(400).json({ error: "Invalid moves." });
  }
  const games = readGames();
  const newGame = {
    username: req.session.user.username,
    moves: moves,
    winner: winner, // Can be "X", "O", or null (tie)
    difficulty: gameMode === "pvai" ? difficulty : null,
    personality: gameMode === "pvai" ? personality : null,
    timestamp: new Date().toISOString(),
  };
  games.push(newGame);
  writeGames(games);
  res.json({ success: true, game: newGame });
});

app.get("/user-games", (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Not logged in." });
  }
  const games = readGames();
  const userGames = games.filter(
    (game) => game.username === req.session.user.username,
  );
  res.json(userGames);
});

// --- CP06-ai: AI move endpoint ---
function findBestMove(gameState) {
  for (let i = 0; i < gameState.length; i++) {
    if (gameState[i] === "") {
      const testState = [...gameState];
      testState[i] = "O";
      if (checkWinCondition(testState, "O")) return i;
    }
  }
  for (let i = 0; i < gameState.length; i++) {
    if (gameState[i] === "") {
      const testState = [...gameState];
      testState[i] = "X";
      if (checkWinCondition(testState, "X")) return i;
    }
  }
  const legalMoves = gameState
    .map((cell, index) => (cell === "" ? index : null))
    .filter((val) => val !== null);
  return legalMoves[Math.floor(Math.random() * legalMoves.length)];
}

function checkWinCondition(state, player) {
  const winConditions = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ];
  return winConditions.some((condition) =>
    condition.every((index) => state[index] === player),
  );
}

const aiPersonalities = {
  easy: {
    comments: ["I'm just playing randomly!", "This should be easy for you!"],
  },
  medium: {
    comments: ["I'm blocking your win!", "You won't beat me that easily!"],
  },
  hard: {
    comments: [
      "I'm calculating the perfect move!",
      "You can't beat me at this level!",
    ],
  },
  aggressive: { comments: ["I'll crush you!", "Prepare to lose!"] },
  defensive: {
    comments: ["I'll protect my territory!", "You won't get past me!"],
  },
  chill: { comments: ["Let's have fun!", "No pressure, just a game!"] },
};

app.post("/ai-move", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Not logged in." });
  }

  const { moves, difficulty, personality = "chill" } = req.body;
  if (!moves || !Array.isArray(moves) || moves.length !== 9) {
    return res.status(400).json({ error: "Invalid moves." });
  }

  let aiMove;
  let comment = "";

  if (difficulty === "easy") {
    const legalMoves = moves
      .map((cell, index) => (cell === "" ? index : null))
      .filter((val) => val !== null);
    aiMove = legalMoves[Math.floor(Math.random() * legalMoves.length)];
    comment =
      aiPersonalities[personality].comments[
        Math.floor(Math.random() * aiPersonalities[personality].comments.length)
      ];
  } else if (difficulty === "medium") {
    aiMove = findBestMove(moves);
    comment =
      aiPersonalities[personality].comments[
        Math.floor(Math.random() * aiPersonalities[personality].comments.length)
      ];
  } else {
    try {
      const response = await groq.chat.completions.create({
        messages: [
          {
            role: "system",
            content:
              "You are an AI for Tic Tac Toe. Respond ONLY with a single number (0-8) representing the best move for player O. Do NOT add any other text.",
          },
          {
            role: "user",
            content: `Current game state: ${moves.join(",")}. Player O's turn. Choose a legal move (0-8). Available moves: ${moves
              .map((m, i) => (m === "" ? i : null))
              .filter((i) => i !== null)
              .join(",")}.`,
          },
        ],
        model: "llama3-8b-instant",
        temperature: 0.1,
        max_tokens: 1,
      });
      aiMove = parseInt(response.choices[0].message.content.trim());
      if (isNaN(aiMove) || aiMove < 0 || aiMove > 8 || moves[aiMove] !== "") {
        aiMove = findBestMove(moves);
      }
      comment =
        aiPersonalities[personality].comments[
          Math.floor(
            Math.random() * aiPersonalities[personality].comments.length,
          )
        ];
    } catch (error) {
      console.error("Groq API error:", error);
      aiMove = findBestMove(moves);
      comment =
        aiPersonalities[personality].comments[
          Math.floor(
            Math.random() * aiPersonalities[personality].comments.length,
          )
        ];
    }
  }

  res.json({ move: aiMove, comment: comment });
});

// --- CP08-stats: Leaderboard and AI Stats Endpoints ---
app.get("/leaderboard", (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Not logged in." });
  }
  const games = readGames();
  const stats = {};

  games.forEach((game) => {
    if (!stats[game.username]) {
      stats[game.username] = { wins: 0, losses: 0, ties: 0 };
    }
    if (game.winner === game.username) {
      stats[game.username].wins++;
    } else if (game.winner === null) {
      stats[game.username].ties++;
    } else {
      stats[game.username].losses++;
    }
  });

  const leaderboard = Object.entries(stats)
    .map(([username, data]) => {
      const total = data.wins + data.losses + data.ties;
      const winRate = total > 0 ? (data.wins / total) * 100 : 0;
      return {
        username,
        wins: data.wins,
        losses: data.losses,
        ties: data.ties,
        winRate,
      };
    })
    .sort((a, b) => b.winRate - a.winRate);

  res.json(leaderboard);
});

app.get("/ai-stats", (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Not logged in." });
  }
  const games = readGames();
  const aiGames = games.filter((game) => game.difficulty && game.personality);

  // Difficulty stats
  const difficultyStats = {};
  aiGames.forEach((game) => {
    if (!difficultyStats[game.difficulty]) {
      difficultyStats[game.difficulty] = { wins: 0, losses: 0, ties: 0 };
    }
    if (game.winner === "O") {
      difficultyStats[game.difficulty].wins++;
    } else if (game.winner === game.username) {
      difficultyStats[game.difficulty].losses++;
    } else {
      difficultyStats[game.difficulty].ties++;
    }
  });

  // Personality stats
  const personalityStats = {};
  aiGames.forEach((game) => {
    if (!personalityStats[game.personality]) {
      personalityStats[game.personality] = { wins: 0, losses: 0, ties: 0 };
    }
    if (game.winner === "O") {
      personalityStats[game.personality].wins++;
    } else if (game.winner === game.username) {
      personalityStats[game.personality].losses++;
    } else {
      personalityStats[game.personality].ties++;
    }
  });

  const difficultyArray = Object.entries(difficultyStats).map(
    ([difficulty, data]) => {
      const total = data.wins + data.losses + data.ties;
      const winRate = total > 0 ? (data.wins / total) * 100 : 0;
      return {
        difficulty,
        wins: data.wins,
        losses: data.losses,
        ties: data.ties,
        winRate,
      };
    },
  );

  const personalityArray = Object.entries(personalityStats).map(
    ([personality, data]) => {
      const total = data.wins + data.losses + data.ties;
      const winRate = total > 0 ? (data.wins / total) * 100 : 0;
      return {
        personality,
        wins: data.wins,
        losses: data.losses,
        ties: data.ties,
        winRate,
      };
    },
  );

  res.json({ difficulty: difficultyArray, personality: personalityArray });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log("Press Ctrl+C to stop");
});
