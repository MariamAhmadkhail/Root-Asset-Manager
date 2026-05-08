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

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log("Press Ctrl+C to stop");
});
