require("dotenv").config();
const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");
const session = require("express-session");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.static(path.join(__dirname, "public")));
app.use(bodyParser.urlencoded({ extended: true })); // Parse form data
app.use(bodyParser.json()); // <-- ADDED: Parse JSON requests
app.use(
  session({
    secret: "your-secret-key", // Change this later for production
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }, // Set to true if using HTTPS
  }),
);

// Helper function to read users from users.json
function readUsers() {
  const usersFilePath = path.join(__dirname, "data", "users.json");
  if (!fs.existsSync(usersFilePath)) {
    fs.writeFileSync(usersFilePath, "[]", "utf8");
  }
  const usersData = fs.readFileSync(usersFilePath, "utf8");
  return JSON.parse(usersData || "[]");
}

// Helper function to write users to users.json
function writeUsers(users) {
  const usersFilePath = path.join(__dirname, "data", "users.json");
  fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2), "utf8");
}

// --- ADDED: Helper functions for games.json ---
// Helper function to read games from games.json
function readGames() {
  const gamesFilePath = path.join(__dirname, "data", "games.json");
  if (!fs.existsSync(gamesFilePath)) {
    fs.writeFileSync(gamesFilePath, "[]", "utf8");
  }
  const gamesData = fs.readFileSync(gamesFilePath, "utf8");
  return JSON.parse(gamesData || "[]");
}

// Helper function to write games to games.json
function writeGames(games) {
  const gamesFilePath = path.join(__dirname, "data", "games.json");
  fs.writeFileSync(gamesFilePath, JSON.stringify(games, null, 2), "utf8");
}

// Root route: Serve index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Register route (POST)
app.post("/register", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).send("Username and password are required.");
  }

  const users = readUsers();
  const userExists = users.some((user) => user.username === username);
  if (userExists) {
    return res.status(400).send("Username already exists.");
  }

  users.push({ username, password });
  writeUsers(users);

  req.session.user = { username };
  res.redirect("/");
});

// Login route (POST)
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

// Logout route
app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/");
});

// Check if user is logged in (for client-side)
app.get("/check-auth", (req, res) => {
  if (req.session.user) {
    res.json({ loggedIn: true, username: req.session.user.username });
  } else {
    res.json({ loggedIn: false });
  }
});

// --- ADDED: Endpoints for saving/fetching games ---
// Save game endpoint
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
    winner: winner || null, // null for ties
    timestamp: new Date().toISOString(),
  };
  games.push(newGame);
  writeGames(games);

  res.json({ success: true, game: newGame });
});

// Get user games endpoint
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

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log("Press Ctrl+C to stop");
});
