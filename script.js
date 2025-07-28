// Import Firebase services
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, deleteDoc, doc, query, where, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

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

// --- Common DOM Elements ---
const messageBox = document.getElementById('messageBox'); // Used in teacher.html
const userIdDisplay = document.getElementById('userIdDisplay'); // Used in teacher.html

/**
 * Displays a message to the user in the message box.
 * @param {string} message - The message to display.
 * @param {boolean} isSuccess - True if it's a success message, false for an error.
 * @param {HTMLElement} targetMessageBox - The message box element to use (e.g., messageBox or configMessageBox).
 */
function showMessage(message, isSuccess, targetMessageBox = messageBox) {
    if (!targetMessageBox) return; // Guard against null messageBox on student page

    targetMessageBox.textContent = message;
    targetMessageBox.classList.remove('hidden', 'bg-red-100', 'text-red-700', 'bg-green-100', 'text-green-700');
    if (isSuccess) {
        targetMessageBox.classList.add('bg-green-100', 'text-green-700');
    } else {
        targetMessageBox.classList.add('bg-red-100', 'text-red-700');
    }
    setTimeout(() => {
        targetMessageBox.classList.add('hidden');
    }, 5000); // Hide message after 5 seconds
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
                if (userIdDisplay) { // Check if userIdDisplay exists (only on teacher page)
                    userIdDisplay.textContent = currentUserId;
                }
                console.log("User signed in with UID:", currentUserId);

                // Determine which page we are on and call the appropriate setup function
                if (window.location.pathname.includes('teacher.html')) {
                    setupTeacherPage();
                } else if (window.location.pathname.includes('student.html')) {
                    setupStudentPage();
                }

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
                    if (userIdDisplay) {
                        showMessage("Failed to sign in. Please check console for details.", false, userIdDisplay);
                        userIdDisplay.textContent = "Error";
                    } else {
                        console.error("Failed to sign in. Cannot display message on this page.");
                    }
                }
            }
        });

    } catch (error) {
        console.error("Error initializing Firebase:", error);
        showMessage("Failed to initialize app. Check console for details.", false);
    }
}


// --- Teacher Page Specific Logic ---
let addQuestionForm;
let questionsList;
let loadingMessage;

function setupTeacherPage() {
    addQuestionForm = document.getElementById('addQuestionForm');
    questionsList = document.getElementById('questionsList');
    loadingMessage = document.getElementById('loadingMessage');

    // Add event listener for form submission
    if (addQuestionForm) {
        addQuestionForm.addEventListener('submit', addQuestion);
    }
    setupQuestionsListener(); // Start listening for questions for the teacher page
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


// --- Student Page Specific Logic ---
let allQuestions = []; // Stores all questions fetched from Firestore
let quizQuestions = []; // Stores questions selected for the current quiz
let currentQuestionIndex = 0;
let studentAnswers = []; // Stores student's selected answers
let timerInterval;
let timeLeft; // in seconds

// DOM elements for student page
const configSection = document.getElementById('configSection');
const quizSection = document.getElementById('quizSection');
const resultsSection = document.getElementById('resultsSection');
const startTestBtn = document.getElementById('startTestBtn');
const numQuestionsInput = document.getElementById('numQuestions');
const timeLimitInput = document.getElementById('timeLimit');
const configMessageBox = document.getElementById('configMessageBox');

const currentQuestionNumSpan = document.getElementById('currentQuestionNum');
const totalQuestionsNumSpan = document.getElementById('totalQuestionsNum');
const timerSpan = document.getElementById('timer');
const questionContainer = document.getElementById('questionContainer');
const prevQuestionBtn = document.getElementById('prevQuestionBtn');
const nextQuestionBtn = document.getElementById('nextQuestionBtn');
const submitTestBtn = document.getElementById('submitTestBtn');

const resultsTotalQuestionsSpan = document.getElementById('resultsTotalQuestions');
const resultsCorrectSpan = document.getElementById('resultsCorrect');
const resultsIncorrectSpan = document.getElementById('resultsIncorrect');
const resultsScoreSpan = document.getElementById('resultsScore');
const answerReviewDiv = document.getElementById('answerReview');
const retakeTestBtn = document.getElementById('retakeTestBtn');


function setupStudentPage() {
    // Add event listeners for student page buttons
    if (startTestBtn) {
        startTestBtn.addEventListener('click', startTest);
    }
    if (prevQuestionBtn) {
        prevQuestionBtn.addEventListener('click', showPreviousQuestion);
    }
    if (nextQuestionBtn) {
        nextQuestionBtn.addEventListener('click', showNextQuestion);
    }
    if (submitTestBtn) {
        submitTestBtn.addEventListener('click', async () => {
            const confirmSubmit = await showCustomConfirm("Are you sure you want to submit the test?");
            if (confirmSubmit) {
                submitTest();
            }
        });
    }
    if (retakeTestBtn) {
        retakeTestBtn.addEventListener('click', resetTest);
    }

    // Fetch all questions when the student page loads
    fetchAllQuestions();
}

/**
 * Fetches all questions from Firestore.
 * This is done once when the student page loads to populate `allQuestions` array.
 */
async function fetchAllQuestions() {
    if (!db) {
        console.error("Firestore not initialized for fetching questions.");
        showMessage("Error: Database not ready. Please refresh.", false, configMessageBox);
        return;
    }

    const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
    const questionsCollectionRef = collection(db, `artifacts/${appId}/public/data/questions`);

    try {
        const querySnapshot = await getDocs(questionsCollectionRef);
        allQuestions = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log(`Fetched ${allQuestions.length} questions.`);
        if (allQuestions.length === 0) {
            showMessage("No questions available in the pool. Please ask a teacher to add some.", false, configMessageBox);
            startTestBtn.disabled = true; // Disable start button if no questions
        } else {
            startTestBtn.disabled = false;
        }
    } catch (error) {
        console.error("Error fetching all questions:", error);
        showMessage("Error loading questions. Please try again.", false, configMessageBox);
        startTestBtn.disabled = true;
    }
}

/**
 * Starts the mock test.
 * Validates inputs, selects random questions, and displays the first question.
 */
async function startTest() {
    const numQuestions = parseInt(numQuestionsInput.value);
    const timeLimitMinutes = parseInt(timeLimitInput.value);

    if (isNaN(numQuestions) || numQuestions < 1 || numQuestions > allQuestions.length) {
        showMessage(`Please enter a valid number of questions between 1 and ${allQuestions.length}.`, false, configMessageBox);
        return;
    }
    if (isNaN(timeLimitMinutes) || timeLimitMinutes < 1) {
        showMessage("Please enter a valid time limit in minutes (minimum 1).", false, configMessageBox);
        return;
    }
    if (allQuestions.length === 0) {
        showMessage("No questions available to start the test. Please add questions first.", false, configMessageBox);
        return;
    }

    // Reset state for a new test
    currentQuestionIndex = 0;
    studentAnswers = new Array(numQuestions).fill(null); // Initialize with null for unanswered
    timeLeft = timeLimitMinutes * 60; // Convert minutes to seconds

    // Randomly select questions
    quizQuestions = [];
    const shuffledQuestions = [...allQuestions].sort(() => 0.5 - Math.random()); // Shuffle
    for (let i = 0; i < numQuestions && i < shuffledQuestions.length; i++) {
        quizQuestions.push(shuffledQuestions[i]);
    }

    if (quizQuestions.length === 0) {
        showMessage("Could not select any questions. Please check the question pool.", false, configMessageBox);
        return;
    }

    // Hide config, show quiz
    configSection.classList.add('hidden');
    quizSection.classList.remove('hidden');
    resultsSection.classList.add('hidden'); // Ensure results are hidden

    totalQuestionsNumSpan.textContent = quizQuestions.length;
    displayQuestion();
    startTimer();
}

/**
 * Displays the current question and its options.
 */
function displayQuestion() {
    if (currentQuestionIndex >= quizQuestions.length) {
        console.error("Attempted to display question beyond quiz length.");
        return;
    }

    const question = quizQuestions[currentQuestionIndex];
    currentQuestionNumSpan.textContent = currentQuestionIndex + 1;

    let optionsHtml = '';
    const optionKeys = ['A', 'B', 'C', 'D'];
    optionKeys.forEach(key => {
        const optionText = question.options[key];
        const isChecked = studentAnswers[currentQuestionIndex] === key;
        optionsHtml += `
            <label class="option-label block p-3 mb-2 rounded-lg border border-gray-300 bg-gray-50 hover:bg-gray-100 cursor-pointer transition duration-200 ease-in-out">
                <input type="radio" name="question${currentQuestionIndex}" value="${key}" class="align-middle" ${isChecked ? 'checked' : ''}>
                <span class="text-gray-800 font-medium align-middle">${key}: ${optionText}</span>
            </label>
        `;
    });

    questionContainer.innerHTML = `
        <p class="text-xl font-bold text-gray-800 mb-4">${currentQuestionIndex + 1}. ${question.question}</p>
        <div class="options-group">
            ${optionsHtml}
        </div>
    `;

    // Add event listeners for radio buttons to save answers
    document.querySelectorAll(`input[name="question${currentQuestionIndex}"]`).forEach(radio => {
        radio.addEventListener('change', (event) => {
            studentAnswers[currentQuestionIndex] = event.target.value;
        });
    });

    // Update navigation button states
    prevQuestionBtn.disabled = currentQuestionIndex === 0;
    if (currentQuestionIndex === quizQuestions.length - 1) {
        nextQuestionBtn.classList.add('hidden');
        submitTestBtn.classList.remove('hidden');
    } else {
        nextQuestionBtn.classList.remove('hidden');
        submitTestBtn.classList.add('hidden');
    }
}

/**
 * Navigates to the next question.
 */
function showNextQuestion() {
    if (currentQuestionIndex < quizQuestions.length - 1) {
        currentQuestionIndex++;
        displayQuestion();
    }
}

/**
 * Navigates to the previous question.
 */
function showPreviousQuestion() {
    if (currentQuestionIndex > 0) {
        currentQuestionIndex--;
        displayQuestion();
    }
}

/**
 * Starts the test timer.
 */
function startTimer() {
    clearInterval(timerInterval); // Clear any existing timer
    timerInterval = setInterval(() => {
        timeLeft--;
        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;
        timerSpan.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            submitTest();
            showMessage("Time's up! Your test has been submitted.", false, configMessageBox); // Use configMessageBox as it's visible after test
        }
    }, 1000);
}

/**
 * Submits the test, calculates results, and displays them.
 */
function submitTest() {
    clearInterval(timerInterval); // Stop the timer

    let correctCount = 0;
    let incorrectCount = 0;
    const reviewHtml = [];

    quizQuestions.forEach((question, index) => {
        const studentAnswer = studentAnswers[index];
        const correctAnswer = question.correctAnswer;
        const isCorrect = studentAnswer === correctAnswer;

        if (isCorrect) {
            correctCount++;
        } else {
            incorrectCount++;
        }

        // Build review HTML for each question
        let optionsReviewHtml = '';
        const optionKeys = ['A', 'B', 'C', 'D'];
        optionKeys.forEach(key => {
            let optionClass = '';
            if (key === correctAnswer) {
                optionClass = 'correct-unselected'; // Highlight correct answer
            }
            if (key === studentAnswer && key === correctAnswer) {
                optionClass = 'correct'; // User selected correct answer
            } else if (key === studentAnswer && key !== correctAnswer) {
                optionClass = 'incorrect'; // User selected incorrect answer
            }

            optionsReviewHtml += `
                <label class="option-label block p-2 mb-1 rounded-lg border border-gray-200 ${optionClass}">
                    <span class="font-medium">${key}: ${question.options[key]}</span>
                    ${key === correctAnswer ? '<span class="ml-2 text-green-700">&#10003; Correct Answer</span>' : ''}
                    ${key === studentAnswer && key !== correctAnswer ? '<span class="ml-2 text-red-700">&#10007; Your Answer</span>' : ''}
                </label>
            `;
        });

        reviewHtml.push(`
            <div class="bg-white p-4 rounded-lg shadow border border-gray-100">
                <p class="text-gray-800 font-semibold mb-2">${index + 1}. ${question.question}</p>
                ${optionsReviewHtml}
                <p class="text-sm mt-2 ${isCorrect ? 'text-green-600' : 'text-red-600'}">
                    Your Answer: ${studentAnswer || 'N/A'} (Correct: ${correctAnswer})
                </p>
            </div>
        `);
    });

    const totalQuestions = quizQuestions.length;
    const score = totalQuestions > 0 ? ((correctCount / totalQuestions) * 100).toFixed(2) : 0;

    // Update results section
    resultsTotalQuestionsSpan.textContent = totalQuestions;
    resultsCorrectSpan.textContent = correctCount;
    resultsIncorrectSpan.textContent = incorrectCount;
    resultsScoreSpan.textContent = score;
    answerReviewDiv.innerHTML = reviewHtml.join('');

    // Show results section, hide quiz section
    quizSection.classList.add('hidden');
    resultsSection.classList.remove('hidden');
}

/**
 * Resets the test to allow retaking.
 */
function resetTest() {
    // Hide results, show config
    resultsSection.classList.add('hidden');
    configSection.classList.remove('hidden');
    // Clear any previous messages
    configMessageBox.classList.add('hidden');
    // Ensure start button is enabled if questions are available
    if (allQuestions.length > 0) {
        startTestBtn.disabled = false;
    }
}


// Initialize Firebase when the window loads
window.onload = initializeFirebaseAndAuth;
