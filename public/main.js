async function checkServerStatus() {
    const statusText = document.getElementById("server-status");

    try {
        // This fetches the "Hello World" message you set up in server.js
        const response = await fetch("/api/hello");
        const data = await response.json();

        // If successful, update the text on your page
        statusText.textContent = `Server Status: ${data.message}`;
        statusText.style.color = "green";
    } catch (error) {
        console.error("Error connecting to server:", error);
        statusText.textContent = "Server Status: Failed to connect to server.";
        statusText.style.color = "red";
    }
}

// Run the function when the page loads
checkServerStatus();
