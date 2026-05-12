require("dotenv").config();
const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");
const session = require("express-session");
const fs = require("fs");
const Groq = require("groq-sdk");

const app = express();
const PORT = process.env.PORT || process.env.REPLIT_PORT || 3000;

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

// CP05-save endpoints
app.post("/save-game", (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Not logged in." });
  }
  const { moves, winner } = req.body;
  if (!moves || !Array.isArray(moves) || moves.length !== 9) {
    return res.status(400).json({ error: "Invalid moves." });
  }
  const games = readGames();
  const newGame = {
    username: req.session.user.username,
    moves: moves,
    winner: winner || null,
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
// Helper function to find the best legal move for AI (fallback)
function findBestMove(gameState) {
  // Check for winning move
  for (let i = 0; i < gameState.length; i++) {
    if (gameState[i] === "") {
      const testState = [...gameState];
      testState[i] = "O"; // AI is O
      if (checkWinCondition(testState, "O")) {
        return i;
      }
    }
  }

  // Check for blocking move (prevent X from winning)
  for (let i = 0; i < gameState.length; i++) {
    if (gameState[i] === "") {
      const testState = [...gameState];
      testState[i] = "X"; // Assume X plays here
      if (checkWinCondition(testState, "X")) {
        return i;
      }
    }
  }

  // Choose a random legal move
  const legalMoves = gameState
    .map((cell, index) => (cell === "" ? index : null))
    .filter((val) => val !== null);
  return legalMoves[Math.floor(Math.random() * legalMoves.length)];
}

// Helper function to check win condition
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

// AI personality comments
const aiPersonalities = {
  easy: {
    comments: [
      "I'm just playing randomly!",
      "This should be easy for you!",
      "Let's see if you can beat me!",
      "I'm not trying too hard here.",
      "Random move incoming!",
    ],
  },
  medium: {
    comments: [
      "I'm blocking your win!",
      "You won't beat me that easily!",
      "I see your strategy!",
      "Let's make this interesting.",
      "I'm playing smart now!",
    ],
  },
  hard: {
    comments: [
      "I'm calculating the perfect move!",
      "You can't beat me at this level!",
      "This is my optimal strategy!",
      "I'm using advanced AI!",
      "Prepare for defeat!",
    ],
  },
};

// AI move endpoint (updated for CP07)
app.post("/ai-move", async (req, res) => {
  console.log("AI move endpoint called!");
  if (!req.session.user) {
    console.log("User not logged in.");
    return res.status(401).json({ error: "Not logged in." });
  }
  // CP10-c2: Chat with AI endpoint
  app.post("/chat-with-ai", async (req, res) => {
    if (!req.session.user) {
      return res.status(401).json({ error: "Not logged in." });
    }

    const { message, personality = "chill" } = req.body;
    console.log("Chat request received:", { message, personality }); // Debug log

    if (!message) {
      return res.status(400).json({ error: "Message is required." });
    }

    try {
      // Personality-specific system prompts
      const personalityPrompts = {
        aggressive:
          "You are an aggressive, competitive Tic Tac Toe AI. Respond in short, bold, and confident messages (1-2 sentences max).",
        defensive:
          "You are a defensive, cautious Tic Tac Toe AI. Respond in short, strategic, and thoughtful messages (1-2 sentences max).",
        chill:
          "You are a chill, relaxed Tic Tac Toe AI. Respond in short, friendly, and casual messages (1-2 sentences max).",
      };

      const systemPrompt =
        personalityPrompts[personality] ||
        "You are a Tic Tac Toe AI. Respond in 1-2 short sentences.";

      console.log("Using system prompt:", systemPrompt); // Debug log

      const response = await groq.chat.completions.create({
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: message,
          },
        ],
        model: "llama3-8b-instant",
        temperature: 0.8,
        max_tokens: 50,
      });

      const aiResponse =
        response.choices[0]?.message?.content?.trim() ||
        "Sorry, I didn't understand that.";
      console.log("AI response:", aiResponse); // Debug log

      res.json({ response: aiResponse });
    } catch (error) {
      console.error("Groq chat error:", error);
      res
        .status(500)
        .json({ response: "Sorry, I'm having trouble responding right now." });
    }
  });

  const { moves, difficulty } = req.body;
  console.log("Received moves:", moves);

  if (!moves || !Array.isArray(moves) || moves.length !== 9) {
    console.log("Invalid moves:", moves);
    return res.status(400).json({ error: "Invalid moves." });
  }

  let aiMove;
  let comment = "";

  // Handle difficulty levels
  if (difficulty === "easy") {
    const legalMoves = moves
      .map((cell, index) => (cell === "" ? index : null))
      .filter((val) => val !== null);
    aiMove = legalMoves[Math.floor(Math.random() * legalMoves.length)];
    comment =
      aiPersonalities.easy.comments[
        Math.floor(Math.random() * aiPersonalities.easy.comments.length)
      ];
  } else if (difficulty === "medium") {
    aiMove = findBestMove(moves);
    comment =
      aiPersonalities.medium.comments[
        Math.floor(Math.random() * aiPersonalities.medium.comments.length)
      ];
  } else {
    try {
      console.log("Calling Groq API...");
      const response = await groq.chat.completions.create({
        messages: [
          {
            role: "system",
            content:
              "You are an AI for Tic Tac Toe. Respond ONLY with a single number (0-8) representing the best move for player O. Do NOT add any other text, explanations, or formatting. Only return the number.",
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

      const rawResponse = response.choices[0].message.content.trim();
      console.log("Groq raw response:", rawResponse);

      aiMove = parseInt(rawResponse);

      if (isNaN(aiMove) || aiMove < 0 || aiMove > 8 || moves[aiMove] !== "") {
        console.log("Groq returned invalid move. Falling back to local logic.");
        aiMove = findBestMove(moves);
      }
      comment =
        aiPersonalities.hard.comments[
          Math.floor(Math.random() * aiPersonalities.hard.comments.length)
        ];
    } catch (error) {
      console.error("Groq API error:", error);
      aiMove = findBestMove(moves);
      comment =
        aiPersonalities.medium.comments[
          Math.floor(Math.random() * aiPersonalities.medium.comments.length)
        ];
    }
  }

  res.json({ move: aiMove, comment: comment });
});

// --- CP08-stats: New endpoints for leaderboard and AI stats ---
// Endpoint to get leaderboard (all players ranked by wins)
app.get("/stats/leaderboard", (req, res) => {
  const games = readGames();
  const leaderboard = {};

  // Count wins, ties, and losses for each player
  games.forEach((game) => {
    if (!game.username) return; // Skip if no username

    if (!leaderboard[game.username]) {
      leaderboard[game.username] = { wins: 0, ties: 0, losses: 0 };
    }

    if (game.winner === null) {
      // Tie
      leaderboard[game.username].ties++;
    } else if (game.winner === "X") {
      // Player X won (assume human is X)
      leaderboard[game.username].wins++;
    } else if (game.winner === "O") {
      // Player O won (AI won, so human lost)
      leaderboard[game.username].losses++;
    }
  });

  // Convert to array and sort by wins (descending)
  const sortedLeaderboard = Object.entries(leaderboard)
    .map(([username, stats]) => ({
      username,
      wins: stats.wins,
      ties: stats.ties,
      losses: stats.losses,
      totalGames: stats.wins + stats.ties + stats.losses,
    }))
    .sort((a, b) => b.wins - a.wins);

  res.json(sortedLeaderboard);
});

// Endpoint to get AI stats (win rates by difficulty and personality)
app.get("/stats/ai", (req, res) => {
  const games = readGames();
  const aiStats = {
    difficulty: {
      easy: { wins: 0, ties: 0, losses: 0, total: 0 },
      medium: { wins: 0, ties: 0, losses: 0, total: 0 },
      hard: { wins: 0, ties: 0, losses: 0, total: 0 },
    },
    personality: {
      aggressive: { wins: 0, ties: 0, losses: 0, total: 0 },
      defensive: { wins: 0, ties: 0, losses: 0, total: 0 },
      chill: { wins: 0, ties: 0, losses: 0, total: 0 },
    },
  };

  // Count AI games by difficulty and personality
  games.forEach((game) => {
    if (game.difficulty && game.personality) {
      const difficulty = game.difficulty;
      const personality = game.personality;
      const winner = game.winner;

      // Update difficulty stats
      if (aiStats.difficulty[difficulty]) {
        aiStats.difficulty[difficulty].total++;
        if (winner === "O") {
          aiStats.difficulty[difficulty].wins++;
        } else if (winner === null) {
          aiStats.difficulty[difficulty].ties++;
        } else {
          aiStats.difficulty[difficulty].losses++;
        }
      }

      // Update personality stats
      if (aiStats.personality[personality]) {
        aiStats.personality[personality].total++;
        if (winner === "O") {
          aiStats.personality[personality].wins++;
        } else if (winner === null) {
          aiStats.personality[personality].ties++;
        } else {
          aiStats.personality[personality].losses++;
        }
      }
    }
  });

  // Calculate win rates
  for (const [key, stats] of Object.entries(aiStats.difficulty)) {
    stats.winRate = stats.total > 0 ? (stats.wins / stats.total) * 100 : 0;
  }
  for (const [key, stats] of Object.entries(aiStats.personality)) {
    stats.winRate = stats.total > 0 ? (stats.wins / stats.total) * 100 : 0;
  }

  res.json(aiStats);
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log("Press Ctrl+C to stop");
});
