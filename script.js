(function() {
  // Wait for the page to load before doing anything
  window.addEventListener("DOMContentLoaded", initializeApp);
  
  function initializeApp() {
    // Grabbing all the elements we'll need later 
    const viewportContainer = document.querySelector(".container");
    const messageListElement = document.querySelector(".chats-container");
    const userInputForm = document.querySelector(".prompt-form");
    const textInputField = userInputForm.querySelector(".prompt-input");
    const attachmentInput = document.querySelector("#file-input");
    const filePreviewArea = document.querySelector(".file-upload-wrapper");
    const themeSwitcher = document.querySelector("#theme-toggle-btn");

    // API info
    const CONFIG = {
      API_KEY: "API_KEY",
      MODEL: "gemini-1.5-flash" 
    };
    
    // The endpoint we'll be hitting for chat responses
    const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.MODEL}:generateContent?key=${CONFIG.API_KEY}`;

    // Need these to keep track of what's happening
    let requestController = null; // For canceling API calls
    let animationTimerId = null; // For the typing effect
    const conversationLog = []; // Chat history
    const currentUserInput = { 
      textContent: "", 
      attachment: null 
    };

    // Check if the user prefers light or dark mode
    const savedThemePreference = localStorage.getItem("themeColor");
    const shouldUseLightTheme = savedThemePreference === "light_mode";
    document.body.classList.toggle("light-theme", shouldUseLightTheme);
    themeSwitcher.textContent = shouldUseLightTheme ? "dark_mode" : "light_mode";

    // Makes creating message bubbles easier
    function createChatBubble(content, roleClasses) {
      const messageElement = document.createElement("div");
      messageElement.classList.add("message", ...roleClasses);
      messageElement.innerHTML = content;
      return messageElement;
    }

    // Smooth scrolling is nicer than jumping around
    function smoothScrollToEnd() {
      requestAnimationFrame(() => {
        viewportContainer.scrollTo({ 
          top: viewportContainer.scrollHeight, 
          behavior: "smooth" 
        });
      });
    }

    // Makes it look like the bot is actually typing
    function simulateTyping(textToDisplay, targetElement, messageContainer) {
      // Start with a clean slate
      targetElement.textContent = "";
      const textSegments = textToDisplay.split(" ");
      let currentPosition = 0;
      
      // Mix up the speed a bit so it feels more human
      const typingSpeed = Math.floor(Math.random() * 20) + 30; 
      
      // Clear any existing typing animation
      if (animationTimerId) clearInterval(animationTimerId);
      
      // Add one word at a time
      animationTimerId = setInterval(() => {
        if (currentPosition < textSegments.length) {
          const delimiter = currentPosition === 0 ? "" : " ";
          targetElement.textContent += delimiter + textSegments[currentPosition++];
          smoothScrollToEnd();
        } else {
          // Typing is done.
          clearInterval(animationTimerId);
          messageContainer.classList.remove("loading");
          document.body.classList.remove("bot-responding");
        }
      }, typingSpeed);
    }

    // This is where we talk to the API and get a response
    async function fetchBotResponse(messageElement) {
      const responseTextContainer = messageElement.querySelector(".message-text");
      requestController = new AbortController();

      // Save what the user said to our conversation history
      conversationLog.push({
        role: "user",
        parts: [
          { text: currentUserInput.textContent },
          ...(currentUserInput.attachment?.data ? [{ 
            inline_data: (() => {
              const { fileName, isImage, ...metaData } = currentUserInput.attachment;
              return metaData;
            })() 
          }] : [])
        ],
      });

      try {
        // Ready to call the API
        const requestOptions = {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: conversationLog }),
          signal: requestController.signal,
        };
        
        // Where we actually call the API
        const response = await fetch(ENDPOINT, requestOptions);
        const responseData = await response.json();
        
        // Something went wrong
        if (!response.ok) {
          throw new Error(responseData.error.message || "Failed to get response");
        }

        // Got a response! Let's clean it up and show it
        const formattedResponseText = responseData.candidates[0].content.parts[0].text
          .replace(/\*\*([^*]+)\*\*/g, "$1")
          .trim();
          
        // Do that cool typing effect
        simulateTyping(formattedResponseText, responseTextContainer, messageElement);

        // Add the bot's response to our history
        conversationLog.push({ 
          role: "model", 
          parts: [{ text: formattedResponseText }] 
        });
        
      } catch (error) {
        // Something went wrong - maybe user canceled or API error
        const isUserCancellation = error.name === "AbortError";
        responseTextContainer.textContent = isUserCancellation 
          ? "Response generation stopped." 
          : `Error: ${error.message}`;
          
        responseTextContainer.style.color = "#d62939";
        messageElement.classList.remove("loading");
        document.body.classList.remove("bot-responding");
        smoothScrollToEnd();
      } finally {
        // Clear any uploaded files
        currentUserInput.attachment = null;
      }
    }

    // Handle when the user submits a message
    function processUserSubmission(event) {
      event.preventDefault();
      
      const userMessage = textInputField.value.trim();
      const isProcessingResponse = document.body.classList.contains("bot-responding");
      
      // Don't do anything if there's no message or we're already processing
      if (!userMessage || isProcessingResponse) return;

      // Save what the user typed
      currentUserInput.textContent = userMessage;
      textInputField.value = "";
      
      // Update the UI to show we're working
      document.body.classList.add("chats-active", "bot-responding");
      filePreviewArea.classList.remove("file-attached", "img-attached", "active");

      // Figure out if we need to show a file attachment
      const hasAttachment = currentUserInput.attachment?.data;
      const attachmentHTML = hasAttachment 
        ? (currentUserInput.attachment.isImage 
          ? `<img src="data:${currentUserInput.attachment.mime_type};base64,${currentUserInput.attachment.data}" class="img-attachment" />` 
          : `<p class="file-attachment"><span class="material-symbols-rounded">description</span>${currentUserInput.attachment.fileName}</p>`) 
        : "";
        
      // Build the user's message bubble
      const userMessageHTML = `
        <p class="message-text"></p>
        ${attachmentHTML}
      `;

      // Add the user's message to the chat
      const userMessageElement = createChatBubble(userMessageHTML, ["user-message"]);
      userMessageElement.querySelector(".message-text").textContent = currentUserInput.textContent;
      messageListElement.appendChild(userMessageElement);
      smoothScrollToEnd();

      // Wait a bit and then show the bot is thinking
      setTimeout(() => {
        const botResponseHTML = `
          <img class="avatar" src="gemini.svg" />
          <p class="message-text">Give me a moment...</p>
        `;
        
        const botMessageElement = createChatBubble(botResponseHTML, ["bot-message", "loading"]);
        messageListElement.appendChild(botMessageElement);
        smoothScrollToEnd();
        
        // Get the bot's response
        fetchBotResponse(botMessageElement);
      }, 750); // Slight delay feels more natural
    }

    // Handle when a user uploads a file
    attachmentInput.addEventListener("change", () => {
      const selectedFile = attachmentInput.files[0];
      if (!selectedFile) return;

      // Check if it's an image or some other file
      const isImageType = selectedFile.type.startsWith("image/");
      const fileReader = new FileReader();
      
      // Show that we're loading the file
      filePreviewArea.classList.add("active");
      
      fileReader.onload = (event) => {
        // Clear the input so we can upload the same file again later if needed
        attachmentInput.value = "";
        
        try {
          // Get the file data
          const rawData = event.target.result;
          const base64Data = rawData.split(",")[1];
          
          // Show a preview
          filePreviewArea.querySelector(".file-preview").src = rawData;
          filePreviewArea.classList.add(isImageType ? "img-attached" : "file-attached");
          
          // Save the file info
          currentUserInput.attachment = {
            fileName: selectedFile.name,
            data: base64Data,
            mime_type: selectedFile.type,
            isImage: isImageType
          };
        } catch (error) {
          // Something went wrong with the file
          console.error("File processing error:", error);
          filePreviewArea.classList.remove("active");
          alert("Ah, sorry. Can't process this. Please try another file.");
        }
      };
      
      // Handle errors with file reading
      fileReader.onerror = () => {
        filePreviewArea.classList.remove("active");
        alert("Ah, sorry. Can't process this. Please try another file.");
      };
      
      // Kick off the file reading
      fileReader.readAsDataURL(selectedFile);
    });

    // Handle clicking the X to cancel a file upload
    document.querySelector("#cancel-file-btn").addEventListener("click", () => {
      currentUserInput.attachment = null;
      filePreviewArea.classList.remove("file-attached", "img-attached", "active");
    });

    // Handle clicking the stop button to cancel a response
    document.querySelector("#stop-response-btn").addEventListener("click", () => {
      if (requestController) requestController.abort();
      currentUserInput.attachment = null;
      
      // Stop any typing animation
      if (animationTimerId) clearInterval(animationTimerId);
      
      // Update the UI
      const pendingBotMessage = messageListElement.querySelector(".bot-message.loading");
      if (pendingBotMessage) pendingBotMessage.classList.remove("loading");
      
      document.body.classList.remove("bot-responding");
    });

    // Handle switching between light and dark mode
    themeSwitcher.addEventListener("click", () => {
      const isNowLightTheme = document.body.classList.toggle("light-theme");
      const newThemeValue = isNowLightTheme ? "light_mode" : "dark_mode";
      
      // Save user preference
      localStorage.setItem("themeColor", newThemeValue);
      themeSwitcher.textContent = isNowLightTheme ? "dark_mode" : "light_mode";
    });

    // Handle clearing the chat history
    document.querySelector("#delete-chats-btn").addEventListener("click", () => {
      // Remove all messages from memory and screen
      conversationLog.length = 0;
      messageListElement.innerHTML = "";
      
      // Resets the UI
      document.body.classList.remove("chats-active", "bot-responding");
      currentUserInput.attachment = null;
    });

    // Handle clicking on the suggestion chips
    document.querySelectorAll(".suggestions-item").forEach((suggestion) => {
      suggestion.addEventListener("click", () => {
        // Get the text from the suggestion
        const suggestionText = suggestion.querySelector(".text").textContent;
        textInputField.value = suggestionText;
        // Submit the form with the suggestion
        userInputForm.dispatchEvent(new Event("submit"));
      });
    });

    // Handle mobile view controls
    document.addEventListener("click", ({ target }) => {
      const promptControls = document.querySelector(".prompt-wrapper");
      const isTextInput = target.classList.contains("prompt-input");
      const isControlButton = promptControls.classList.contains("hide-controls") && 
        (target.id === "add-file-btn" || target.id === "stop-response-btn");
        
      // Toggle controls visibility based on what was clicked
      promptControls.classList.toggle("hide-controls", isTextInput || isControlButton);
    });

    // Set up form submission handler
    userInputForm.addEventListener("submit", processUserSubmission);
    // Make the file button work
    document.querySelector("#add-file-btn").addEventListener("click", () => attachmentInput.click());
    // Make the send button work too
    document.querySelector("#send-prompt-btn").addEventListener("click", (e) => {
      e.preventDefault();
      userInputForm.dispatchEvent(new Event("submit"));
    });
  }
})();
