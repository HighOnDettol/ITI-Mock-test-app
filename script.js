// Import Firebase services
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, deleteDoc, doc, query, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Firebase Configuration ---
// IMPORTANT: Replace this with YOUR Firebase project's configuration!
// You obtained this from the Firebase Console in Step 1.
const firebaseConfig = {
    apiKey: "AIzaSyAnd2fGeYFVy3-BfgHUVft_eVAPLCOdtJM",
  authDomain: "iti-mock-test-app.firebaseapp.com",
  projectId: "iti-mock-test-app",
  storageBucket: "iti-mock-test-app.firebasestorage.app",
  messagingSenderId: "1050492527635",
  appId: "1:1050492527635:web:b1d88a3442b1329590cbe6",
  measurementId: "G-C28JE2Y4NH"
};

// Global variables for Firebase instances and user ID
let app;
let db;
let auth;
let currentUserId = null; // Stores the authenticated user's ID

// Get references to DOM elements
const addQuestionForm = document.getElementById('addQuestionForm');
const questionsList = document.getElementById('questionsList');
const messageBox = document.getElementById('messageBox');
const userIdDisplay = document.getElementById('userIdDisplay');
const loadingMessage = document.getElementById('loadingMessage');

/**
 * Displays a message to the user in the message box.
 * @param {string} message - The message to display.
 * @param {boolean} isSuccess - True if it's a success message, false for an error.
 */
function showMessage(message, isSuccess) {
    messageBox.textContent = message;
    messageBox.classList.remove('hidden', 'bg-red-100', 'text-red-700', 'bg-green-100', 'text-green-700');
    if (isSuccess) {
        messageBox.classList.add('bg-green-100', 'text-green-700');
    } else {
        messageBox.classList.add('bg-red-100', 'text-red-700');
    }
    setTimeout(() => {
        messageBox.classList.add('hidden');
    }, 5000); // Hide message after 5 seconds
}

/**
 * Initializes Firebase and sets up authentication.
 * This function is called once the window has loaded.
 */
async function initializeFirebaseAndAuth() {
    try {
        // Initialize Firebase app
        app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);

        // Listen for authentication state changes
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                // User is signed in.
                currentUserId = user.uid;
                userIdDisplay.textContent = currentUserId;
                console.log("User signed in with UID:", currentUserId);
                // Once authenticated, start listening for questions
                setupQuestionsListener();
            } else {
                // User is signed out.
                console.log("No user signed in. Attempting anonymous sign-in.");
                // Attempt to sign in anonymously if no user is signed in
                try {
                    // Use __initial_auth_token if available, otherwise sign in anonymously
                    if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                        await signInWithCustomToken(auth, __initial_auth_token);
                        console.log("Signed in with custom token.");
                    } else {
                        await signInAnonymously(auth);
                        console.log("Signed in anonymously.");
                    }
                } catch (error) {
                    console.error("Error during anonymous sign-in:", error);
                    showMessage("Failed to sign in. Please check console for details.", false);
                    userIdDisplay.textContent = "Error";
                }
            }
        });

    } catch (error) {
        console.error("Error initializing Firebase:", error);
        showMessage("Failed to initialize app. Check console for details.", false);
    }
}

/**
 * Adds a new question to Firestore.
 * @param {Event} event - The form submission event.
 */
async function addQuestion(event) {
    event.preventDefault(); // Prevent default form submission

    if (!currentUserId) {
        showMessage("Authentication not ready. Please wait.", false);
        return;
    }

    // Get form values
    const questionText = document.getElementById('questionText').value.trim();
    const optionA = document.getElementById('optionA').value.trim();
    const optionB = document.getElementById('optionB').value.trim();
    const optionC = document.getElementById('optionC').value.trim();
    const optionD = document.getElementById('optionD').value.trim();
    const correctOption = document.getElementById('correctOption').value.trim().toUpperCase();

    // Basic validation
    if (!questionText || !optionA || !optionB || !optionC || !optionD || !correctOption) {
        showMessage("Please fill in all fields.", false);
        return;
    }
    if (!['A', 'B', 'C', 'D'].includes(correctOption)) {
        showMessage("Correct option must be A, B, C, or D.", false);
        return;
    }

    try {
        // Define the collection path for public data
        // Using __app_id for unique application identification
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        const questionsCollectionRef = collection(db, `artifacts/${appId}/public/data/questions`);

        // Add the question document to the 'questions' collection
        await addDoc(questionsCollectionRef, {
            question: questionText,
            options: {
                A: optionA,
                B: optionB,
                C: optionC,
                D: optionD
            },
            correctAnswer: correctOption,
            createdAt: new Date(), // Timestamp for when the question was added
            addedBy: currentUserId // Store the ID of the user who added the question
        });

        showMessage("Question added successfully!", true);
        addQuestionForm.reset(); // Clear the form
    } catch (error) {
        console.error("Error adding question:", error);
        showMessage("Error adding question. Please try again.", false);
    }
}

/**
 * Sets up a real-time listener for questions in Firestore.
 * This will update the UI whenever questions are added, modified, or deleted.
 */
function setupQuestionsListener() {
    if (!db) {
        console.error("Firestore not initialized.");
        return;
    }

    const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
    const questionsCollectionRef = collection(db, `artifacts/${appId}/public/data/questions`);

    // Create a query to listen to all questions in the public collection
    // Note: orderBy is intentionally avoided as per instructions to prevent index issues.
    // Sorting will be done in memory if needed.
    const q = query(questionsCollectionRef);

    // Set up the real-time listener
    onSnapshot(q, (snapshot) => {
        questionsList.innerHTML = ''; // Clear existing questions
        loadingMessage.classList.add('hidden'); // Hide loading message

        if (snapshot.empty) {
            questionsList.innerHTML = '<p class="text-gray-500 text-center">No questions added yet.</p>';
            return;
        }

        snapshot.forEach((doc) => {
            const questionData = doc.data();
            const questionId = doc.id; // Get the document ID for deletion

            const questionCard = document.createElement('div');
            questionCard.className = 'bg-white p-4 rounded-lg shadow border border-gray-100';
            questionCard.innerHTML = `
                <p class="text-gray-800 font-semibold mb-2">${questionData.question}</p>
                <ul class="list-disc list-inside text-gray-600 mb-2">
                    <li>A: ${questionData.options.A}</li>
                    <li>B: ${questionData.options.B}</li>
                    <li>C: ${questionData.options.C}</li>
                    <li>D: ${questionData.options.D}</li>
                </ul>
                <p class="text-green-600 font-medium mb-2">Correct Answer: ${questionData.correctAnswer}</p>
                <p class="text-gray-500 text-xs">Added by: ${questionData.addedBy || 'Unknown'} on ${questionData.createdAt ? new Date(questionData.createdAt.toDate()).toLocaleString() : 'N/A'}</p>
                <button data-id="${questionId}" class="delete-btn mt-3 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold py-1 px-3 rounded-md transition duration-300 ease-in-out">
                    Delete
                </button>
            `;
            questionsList.appendChild(questionCard);
        });

        // Add event listeners to newly created delete buttons
        document.querySelectorAll('.delete-btn').forEach(button => {
            button.addEventListener('click', handleDeleteQuestion);
        });
    }, (error) => {
        console.error("Error listening to questions:", error);
        questionsList.innerHTML = '<p class="text-red-500 text-center">Error loading questions. Please try again.</p>';
    });
}

/**
 * Handles the deletion of a question from Firestore.
 * @param {Event} event - The click event from the delete button.
 */
async function handleDeleteQuestion(event) {
    const questionId = event.target.dataset.id;
    if (!questionId) {
        showMessage("Could not find question ID to delete.", false);
        return;
    }

    // Custom confirmation dialog (instead of alert/confirm)
    const confirmDelete = await showCustomConfirm("Are you sure you want to delete this question?");
    if (!confirmDelete) {
        return; // User cancelled
    }

    try {
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        const questionDocRef = doc(db, `artifacts/${appId}/public/data/questions`, questionId);
        await deleteDoc(questionDocRef);
        showMessage("Question deleted successfully!", true);
    } catch (error) {
        console.error("Error deleting question:", error);
        showMessage("Error deleting question. Please try again.", false);
    }
}

/**
 * Shows a custom confirmation dialog.
 * @param {string} message - The message to display in the dialog.
 * @returns {Promise<boolean>} - Resolves with true if confirmed, false if cancelled.
 */
function showCustomConfirm(message) {
    return new Promise((resolve) => {
        const dialog = document.createElement('div');
        dialog.className = 'fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50';
        dialog.innerHTML = `
            <div class="bg-white p-6 rounded-lg shadow-xl max-w-sm w-full text-center">
                <p class="text-lg font-semibold text-gray-800 mb-4">${message}</p>
                <div class="flex justify-center space-x-4">
                    <button id="confirmYes" class="bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded-lg transition duration-300">Yes</button>
                    <button id="confirmNo" class="bg-gray-300 hover:bg-gray-400 text-gray-800 font-semibold py-2 px-4 rounded-lg transition duration-300">No</button>
                </div>
            </div>
        `;
        document.body.appendChild(dialog);

        document.getElementById('confirmYes').onclick = () => {
            document.body.removeChild(dialog);
            resolve(true);
        };
        document.getElementById('confirmNo').onclick = () => {
            document.body.removeChild(dialog);
            resolve(false);
        };
    });
}


// --- Event Listeners ---
// Add event listener for form submission
if (addQuestionForm) {
    addQuestionForm.addEventListener('submit', addQuestion);
}

// Initialize Firebase when the window loads
window.onload = initializeFirebaseAndAuth;
