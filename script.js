// Import Firebase services
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, deleteDoc, doc, query, where, getDocs, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Firebase Configuration ---
// IMPORTANT: This configuration is for your specific project.
const firebaseConfig = {
    apiKey: "AIzaSyAnd2fGeYFVy3-BfgHUVft_eVAPLCOdtJM",
    authDomain: "iti-mock-test-app.firebaseapp.com",
    projectId: "iti-mock-test-app",
    storageBucket: "iti-mock-test-app.firebasestorage.app",
    messagingSenderId: "1050492527635",
    appId: "1:1050492527635:web:b1d88a3442b1329590cbe6"
};

// Global variables for Firebase instances and user ID
let app;
let db;
let auth;
let currentUserId = null; // Stores the authenticated user's ID
let currentUserEmail = null; // Stores the authenticated user's email
let currentUserName = null; // Stores the authenticated teacher's name
let currentUserSubject = null; // Stores the authenticated teacher's subject
let isTeacherAuthorized = false; // Flag to check if the current user is an authorized teacher
let authorizedTeacherUids = []; // Array to store UIDs of authorized teachers

// --- Common DOM Elements ---
const messageBox = document.getElementById('messageBox'); // Used in teacher.html for question messages
const userIdDisplay = document.getElementById('userIdDisplay'); // Used in teacher.html
const userEmailDisplay = document.getElementById('userEmailDisplay'); // Used in teacher.html
const userDisplayName = document.getElementById('userDisplayName'); // Used in teacher.html
const authStatus = document.getElementById('authStatus'); // Used in teacher.html

// Sample questions to preload if the database is empty
const sampleQuestions = [
    {
        question: "What is the primary function of a spanner?",
        options: {
            A: "To cut materials",
            B: "To measure length",
            C: "To hold or grip nuts and bolts",
            D: "To hammer nails"
        },
        correctAnswer: "C",
        subject: "Fitter"
    },
    {
        question: "Which of the following is not a type of welding joint?",
        options: {
            A: "Lap Joint",
            B: "Butt Joint",
            C: "T-Joint",
            D: "Square Joint"
        },
        correctAnswer: "D",
        subject: "Welding"
    },
    {
        question: "Which device is used to measure electric current?",
        options: {
            A: "Voltmeter",
            B: "Ammeter",
            C: "Ohmmeter",
            D: "Wattmeter"
        },
        correctAnswer: "B",
        subject: "Electrician"
    }
];

/**
 * Preloads a set of sample questions into the database if the questions collection is empty.
 * This is to ensure the app works out-of-the-box and the student section has questions to display.
 */
async function preloadQuestions() {
    try {
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        const questionsCollectionRef = collection(db, `artifacts/${appId}/public/data/questions`);
        const querySnapshot = await getDocs(questionsCollectionRef);
        
        if (querySnapshot.empty) {
            console.log("Preloading sample questions...");
            for (const q of sampleQuestions) {
                await addDoc(questionsCollectionRef, {
                    ...q,
                    createdAt: new Date(),
                    addedBy: "system",
                    addedByEmail: "system@iti.com",
                    addedByName: "System Admin"
                });
            }
            console.log("Sample questions preloaded successfully.");
        }
    } catch (error) {
        console.error("Error preloading questions:", error);
    }
}


/**
 * Displays a message to the user in the message box.
 * @param {string} message - The message to display.
 * @param {boolean} isSuccess - True if it's a success message, false for an error.
 * @param {HTMLElement} targetMessageBox - The message box element to use (e.g., messageBox or authMessageBox).
 */
function showMessage(message, isSuccess, targetMessageBox) {
    if (!targetMessageBox) return; // Guard against null messageBox on student page or if not provided

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
        app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
        
        // Preload questions on initial app startup, only if the collection is empty.
        preloadQuestions();

        // Listen for authentication state changes
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                currentUserId = user.uid;
                currentUserEmail = user.email; // Get email if available

                // Fetch authorized teacher UIDs
                await fetchAuthorizedTeachers();
                // Fetch teacher profile data
                await fetchTeacherProfile(currentUserId);

                if (window.location.pathname.includes('teacher.html')) {
                    setupTeacherPage();
                } else if (window.location.pathname.includes('student.html')) {
                    setupStudentPage();
                }

            } else {
                // User is signed out.
                console.log("No user signed in.");
                currentUserId = null;
                currentUserEmail = null;
                currentUserName = null; // Reset
                currentUserSubject = null; // Reset
                isTeacherAuthorized = false; // Reset authorization status

                // If on teacher page, ensure login form is shown
                if (window.location.pathname.includes('teacher.html')) {
                    if (authSection) authSection.classList.remove('hidden');
                    if (teacherContent) teacherContent.classList.add('hidden');
                    if (userEmailDisplay) userEmailDisplay.textContent = 'N/A';
                    if (userIdDisplay) userIdDisplay.textContent = 'N/A';
                    if (userDisplayName) userDisplayName.textContent = 'N/A'; // Reset display name
                    if (authStatus) authStatus.textContent = '';
                }

                // Attempt to sign in anonymously for student page or initial teacher page load
                // This is needed for Firestore read permissions for public data
                try {
                    if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                        await signInWithCustomToken(auth, __initial_auth_token);
                        console.log("Signed in with custom token.");
                    } else {
                        await signInAnonymously(auth);
                        console.log("Signed in anonymously for public data access.");
                    }
                } catch (error) {
                    console.error("Error during anonymous sign-in:", error);
                    if (window.location.pathname.includes('teacher.html')) {
                        showMessage("Failed to sign in. Please check console for details.", false, authMessageBox);
                    } else {
                        showMessage("Failed to initialize. Please refresh.", false, document.getElementById('configMessageBox'));
                    }
                }
            }
        });

    } catch (error) {
        console.error("Error initializing Firebase:", error);
        showMessage("Failed to initialize app. Check console for details.", false, document.getElementById('authMessageBox') || document.getElementById('configMessageBox'));
    }
}

/**
 * Fetches the list of authorized teacher UIDs from Firestore.
 */
async function fetchAuthorizedTeachers() {
    if (!db) return;

    const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
    const configDocRef = doc(db, `artifacts/${appId}/public/data/config`, 'authorizedTeachers');

    try {
        const docSnap = await getDoc(configDocRef);
        if (docSnap.exists()) {
            authorizedTeacherUids = docSnap.data().uids || [];
        } else {
            authorizedTeacherUids = [];
            console.log("No authorized teachers config found. First signup will become authorized.");
        }
        // Check if current user is authorized
        if (currentUserId && authorizedTeacherUids.includes(currentUserId)) {
            isTeacherAuthorized = true;
        } else {
            isTeacherAuthorized = false;
        }
    } catch (error) {
        console.error("Error fetching authorized teachers:", error);
        authorizedTeacherUids = []; // Assume no authorized teachers on error
        isTeacherAuthorized = false;
    }
}

/**
 * Adds a user's UID to the list of authorized teachers in Firestore.
 * This should only be called for the first teacher signup or by an admin.
 * @param {string} uid - The UID of the user to authorize.
 */
async function authorizeTeacher(uid) {
    if (!db) return;

    const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
    const configDocRef = doc(db, `artifacts/${appId}/public/data/config`, 'authorizedTeachers');

    try {
        // Fetch current list, add new UID if not present, and save
        await fetchAuthorizedTeachers(); // Ensure authorizedTeacherUids is up-to-date
        if (!authorizedTeacherUids.includes(uid)) {
            authorizedTeacherUids.push(uid);
            await setDoc(configDocRef, { uids: authorizedTeacherUids }, { merge: true });
            console.log(`User ${uid} authorized as teacher.`);
            isTeacherAuthorized = true; // Update status immediately
        }
    } catch (error) {
        console.error("Error authorizing teacher:", error);
    }
}

/**
 * Fetches the profile data for the current teacher.
 * @param {string} uid - The UID of the teacher.
 */
async function fetchTeacherProfile(uid) {
    if (!db || !uid) return;

    const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
    const teacherProfileDocRef = doc(db, `artifacts/${appId}/public/data/teacherProfiles`, uid);

    try {
        const docSnap = await getDoc(teacherProfileDocRef);
        if (docSnap.exists()) {
            const profileData = docSnap.data();
            currentUserName = profileData.name || 'N/A';
            currentUserSubject = profileData.subjectTaught || 'N/A';
            console.log("Teacher profile fetched:", profileData);
        } else {
            currentUserName = currentUserEmail || 'Anonymous'; // Fallback to email if no profile
            currentUserSubject = 'N/A';
            console.log("No teacher profile found for UID:", uid);
        }
    } catch (error) {
        console.error("Error fetching teacher profile:", error);
        currentUserName = currentUserEmail || 'Anonymous';
        currentUserSubject = 'N/A';
    }
}


// --- Teacher Page Specific Logic ---
let authSection;
let teacherContent;
let authForm;
let emailInput;
let passwordInput;
let loginBtn;
let signupBtn;
let logoutBtn;
let authMessageBox;

// New signup fields
let signupFields;
let teacherNameInput;
let subjectTaughtInput;
let confirmPasswordField;
let confirmPasswordInput;


let addQuestionForm;
let questionsList;
let loadingMessage;
let questionText;
let optionA;
let optionB;
let optionC;
let optionD;
let correctOption;
let questionIdToEdit; // Hidden input for question ID being edited
let formTitle; // Title of the form
let submitQuestionBtn; // Submit button for the form
let cancelEditBtn; // Cancel edit button


function setupTeacherPage() {
    // Get teacher page specific DOM elements
    authSection = document.getElementById('authSection');
    teacherContent = document.getElementById('teacherContent');
    authForm = document.getElementById('authForm');
    emailInput = document.getElementById('email');
    passwordInput = document.getElementById('password');
    loginBtn = document.getElementById('loginBtn');
    signupBtn = document.getElementById('signupBtn');
    logoutBtn = document.getElementById('logoutBtn');
    authMessageBox = document.getElementById('authMessageBox');

    // Get new signup fields
    signupFields = document.getElementById('signupFields');
    teacherNameInput = document.getElementById('teacherName');
    subjectTaughtInput = document.getElementById('subjectTaught');
    confirmPasswordField = document.getElementById('confirmPasswordField');
    confirmPasswordInput = document.getElementById('confirmPassword');


    addQuestionForm = document.getElementById('addQuestionForm');
    questionsList = document.getElementById('questionsList');
    loadingMessage = document.getElementById('loadingMessage');

    // Get form input elements
    questionText = document.getElementById('questionText');
    optionA = document.getElementById('optionA');
    optionB = document.getElementById('optionB');
    optionC = document.getElementById('optionC');
    optionD = document.getElementById('optionD');
    correctOption = document.getElementById('correctOption');
    questionIdToEdit = document.getElementById('questionIdToEdit'); // Get the hidden input
    formTitle = document.getElementById('formTitle'); // Get the form title
    submitQuestionBtn = document.getElementById('submitQuestionBtn'); // Get the submit button
    cancelEditBtn = document.getElementById('cancelEditBtn'); // Get the cancel edit button


    // Display user info if logged in
    if (currentUserId) {
        if (userEmailDisplay) userEmailDisplay.textContent = currentUserEmail || 'Anonymous';
        if (userIdDisplay) userIdDisplay.textContent = currentUserId;
        if (userDisplayName) userDisplayName.textContent = currentUserName || currentUserEmail || 'Anonymous'; // Show name or email
        if (authStatus) authStatus.textContent = isTeacherAuthorized ? ' (Authorized Teacher)' : ' (Unauthorized)';

        // Show/hide sections based on authorization
        if (isTeacherAuthorized) {
            if (authSection) authSection.classList.add('hidden');
            if (teacherContent) teacherContent.classList.remove('hidden');
            setupQuestionsListener(); // Only listen for questions if authorized
        } else {
            if (authSection) authSection.classList.remove('hidden');
            if (teacherContent) teacherContent.classList.add('hidden');
            showMessage("You are logged in but not authorized to manage questions. Please contact administrator.", false, authMessageBox);
        }
    } else {
        // Not logged in, show auth section
        if (authSection) authSection.classList.remove('hidden');
        if (teacherContent) teacherContent.classList.add('hidden');
    }

    // Add event listeners for teacher page authentication
    if (loginBtn) {
        loginBtn.addEventListener('click', handleLogin);
    }
    if (signupBtn) {
        signupBtn.addEventListener('click', () => {
            // Show signup specific fields
            if (signupFields) signupFields.classList.remove('hidden');
            if (confirmPasswordField) confirmPasswordField.classList.remove('hidden');
            // Change login button to submit for signup
            if (loginBtn) loginBtn.type = 'button'; // Prevent login from submitting form
            if (signupBtn) signupBtn.type = 'submit'; // Make signup button submit form
            // Re-attach event listener to authForm for signup submission
            if (authForm) authForm.removeEventListener('submit', handleLogin);
            if (authForm) authForm.addEventListener('submit', handleSignUp);
        });
    }
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
    if (addQuestionForm) {
        addQuestionForm.addEventListener('submit', handleQuestionFormSubmit);
    }
    if (cancelEditBtn) {
        cancelEditBtn.addEventListener('click', cancelEdit);
    }
}

/**
 * Handles teacher login.
 * @param {Event} event - The click event.
 */
async function handleLogin(event) {
    event.preventDefault(); // Prevent form submission if loginBtn is type="submit"
    const email = emailInput.value;
    const password = passwordInput.value;

    if (!email || !password) {
        showMessage("Please enter email and password.", false, authMessageBox);
        return;
    }

    try {
        await signInWithEmailAndPassword(auth, email, password);
        showMessage("Logged in successfully!", true, authMessageBox);
        // onAuthStateChanged listener will handle UI update
    } catch (error) {
        console.error("Login error:", error);
        let errorMessage = "Login failed. Please check your credentials.";
        if (error.code === 'auth/user-not-found') {
            errorMessage = "No account found with this email. Please sign up.";
        } else if (error.code === 'auth/wrong-password') {
            errorMessage = "Incorrect password.";
        }
        showMessage(errorMessage, false, authMessageBox);
    }
}

/**
 * Handles teacher signup.
 * @param {Event} event - The click event.
 */
async function handleSignUp(event) {
    event.preventDefault(); // Prevent form submission
    const name = teacherNameInput.value.trim();
    const subject = subjectTaughtInput.value.trim();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    if (!name || !subject || !email || !password || !confirmPassword) {
        showMessage("Please fill in all signup fields.", false, authMessageBox);
        return;
    }
    if (password.length < 6) {
        showMessage("Password must be at least 6 characters long.", false, authMessageBox);
        return;
    }
    if (password !== confirmPassword) {
        showMessage("Passwords do not match.", false, authMessageBox);
        return;
    }

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Save additional teacher profile data to Firestore
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        const teacherProfileDocRef = doc(db, `artifacts/${appId}/public/data/teacherProfiles`, user.uid);
        await setDoc(teacherProfileDocRef, {
            uid: user.uid,
            email: user.email,
            name: name,
            subjectTaught: subject,
            createdAt: new Date()
        });

        // Automatically authorize the teacher
        await authorizeTeacher(user.uid);

        showMessage("Account created and authorized successfully! You can now log in.", true, authMessageBox);
        authForm.reset(); // Clear form after signup
        // Hide signup specific fields after successful signup
        if (signupFields) signupFields.classList.add('hidden');
        if (confirmPasswordField) confirmPasswordField.classList.add('hidden');
        // Revert button types and event listeners for login
        if (loginBtn) loginBtn.type = 'submit';
        if (signupBtn) signupBtn.type = 'button';
        if (authForm) authForm.removeEventListener('submit', handleSignUp);
        if (authForm) authForm.addEventListener('submit', handleLogin);

    } catch (error) {
        console.error("Signup error:", error);
        let errorMessage = "Signup failed.";
        if (error.code === 'auth/email-already-in-use') {
            errorMessage = "This email is already registered. Please login instead.";
        } else if (error.code === 'auth/weak-password') {
            errorMessage = "Password is too weak. Please use a stronger password.";
        }
        showMessage(errorMessage, false, authMessageBox);
    }
}

/**
 * Handles teacher logout.
 */
async function handleLogout() {
    try {
        await signOut(auth);
        showMessage("Logged out successfully!", true, authMessageBox);
        // onAuthStateChanged listener will handle UI update
    } catch (error) {
        console.error("Logout error:", error);
        showMessage("Failed to log out. Please try again.", false, authMessageBox);
    }
}

/**
 * Main handler for the question form. Determines if it's an add or update operation.
 * @param {Event} event - The form submission event.
 */
async function handleQuestionFormSubmit(event) {
    event.preventDefault();

    if (!isTeacherAuthorized) {
        showMessage("You are not authorized to manage questions.", false, messageBox);
        return;
    }

    const qId = questionIdToEdit.value; // Get the ID from the hidden input

    if (qId) {
        // If questionIdToEdit has a value, it's an update operation
        await updateQuestion(qId);
    } else {
        // Otherwise, it's an add new question operation
        await addQuestion();
    }
}

/**
 * Adds a new question to Firestore.
 */
async function addQuestion() {
    // Get form values
    const qText = questionText.value.trim();
    const optA = optionA.value.trim();
    const optB = optionB.value.trim();
    const optC = optionC.value.trim();
    const optD = optionD.value.trim();
    const correctOpt = correctOption.value.trim().toUpperCase();

    // Basic validation
    if (!qText || !optA || !optB || !optC || !optD || !correctOpt) {
        showMessage("Please fill in all fields.", false, messageBox);
        return;
    }
    if (!['A', 'B', 'C', 'D'].includes(correctOpt)) {
        showMessage("Correct option must be A, B, C, or D.", false, messageBox);
        return;
    }

    try {
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        const questionsCollectionRef = collection(db, `artifacts/${appId}/public/data/questions`);

        await addDoc(questionsCollectionRef, {
            question: qText,
            options: {
                A: optA,
                B: optB,
                C: optC,
                D: optD
            },
            correctAnswer: correctOpt,
            createdAt: new Date(),
            addedBy: currentUserId,
            addedByEmail: currentUserEmail || 'N/A',
            addedByName: currentUserName || 'N/A' // Store teacher's name
        });

        showMessage("Question added successfully!", true, messageBox);
        addQuestionForm.reset(); // Clear the form
    } catch (error) {
        console.error("Error adding question:", error);
        showMessage("Error adding question. Please try again.", false, messageBox);
    }
}

/**
 * Updates an existing question in Firestore.
 * @param {string} questionId - The ID of the question document to update.
 */
async function updateQuestion(questionId) {
    // Get form values
    const qText = questionText.value.trim();
    const optA = optionA.value.trim();
    const optB = optionB.value.trim();
    const optC = optionC.value.trim();
    const optD = optionD.value.trim();
    const correctOpt = correctOption.value.trim().toUpperCase();

    // Basic validation
    if (!qText || !optA || !optB || !optC || !optD || !correctOpt) {
        showMessage("Please fill in all fields.", false, messageBox);
        return;
    }
    if (!['A', 'B', 'C', 'D'].includes(correctOpt)) {
        showMessage("Correct option must be A, B, C, or D.", false, messageBox);
        return;
    }

    try {
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        const questionDocRef = doc(db, `artifacts/${appId}/public/data/questions`, questionId);

        await updateDoc(questionDocRef, {
            question: qText,
            options: {
                A: optA,
                B: optB,
                C: optC,
                D: optD
            },
            correctAnswer: correctOpt,
            lastModifiedAt: new Date(), // Add a last modified timestamp
            lastModifiedBy: currentUserId,
            lastModifiedByEmail: currentUserEmail || 'N/A',
            lastModifiedByName: currentUserName || 'N/A' // Store teacher's name
        });

        showMessage("Question updated successfully!", true, messageBox);
        cancelEdit(); // Reset form after update
    } catch (error) {
        console.error("Error updating question:", error);
        showMessage("Error updating question. Please try again.", false, messageBox);
    }
}


/**
 * Sets up a real-time listener for questions in Firestore.
 * This will update the UI whenever questions are added, modified, or deleted.
 * Only runs if the user is an authorized teacher.
 */
function setupQuestionsListener() {
    if (!db || !isTeacherAuthorized) {
        console.error("Firestore not initialized or user not authorized to listen to questions.");
        if (questionsList) questionsList.innerHTML = '<p class="text-red-500 text-center">Not authorized to view questions.</p>';
        return;
    }

    const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
    const questionsCollectionRef = collection(db, `artifacts/${appId}/public/data/questions`);

    const q = query(questionsCollectionRef);

    onSnapshot(q, (snapshot) => {
        if (questionsList) questionsList.innerHTML = '';
        if (loadingMessage) loadingMessage.classList.add('hidden');

        if (snapshot.empty) {
            if (questionsList) questionsList.innerHTML = '<p class="text-gray-500 text-center">No questions added yet.</p>';
            return;
        }

        snapshot.forEach((docSnap) => {
            const questionData = docSnap.data();
            const questionId = docSnap.id;

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
                <p class="text-gray-500 text-xs">Added by: ${questionData.addedByName || questionData.addedByEmail || questionData.addedBy || 'Unknown'} on ${questionData.createdAt ? new Date(questionData.createdAt.toDate()).toLocaleString() : 'N/A'}</p>
                ${questionData.lastModifiedAt ? `<p class="text-gray-500 text-xs">Last Modified: ${new Date(questionData.lastModifiedAt.toDate()).toLocaleString()} by ${questionData.lastModifiedByName || questionData.lastModifiedByEmail || questionData.lastModifiedBy || 'Unknown'}</p>` : ''}
                <div class="flex space-x-2 mt-3">
                    <button data-id="${questionId}" class="edit-btn bg-yellow-500 hover:bg-yellow-600 text-white text-sm font-semibold py-1 px-3 rounded-md transition duration-300 ease-in-out">
                        Edit
                    </button>
                    <button data-id="${questionId}" class="delete-btn bg-red-500 hover:bg-red-600 text-white text-sm font-semibold py-1 px-3 rounded-md transition duration-300 ease-in-out">
                        Delete
                    </button>
                </div>
            `;
            if (questionsList) questionsList.appendChild(questionCard);
        });

        // Add event listeners to newly created buttons
        document.querySelectorAll('.delete-btn').forEach(button => {
            button.addEventListener('click', handleDeleteQuestion);
        });
        document.querySelectorAll('.edit-btn').forEach(button => {
            button.addEventListener('click', handleEditQuestion); // New event listener
        });
    }, (error) => {
        console.error("Error listening to questions:", error);
        if (questionsList) questionsList.innerHTML = '<p class="text-red-500 text-center">Error loading questions. Please try again.</p>';
    });
}

/**
 * Handles the deletion of a question from Firestore, only if the user is an authorized teacher.
 * @param {Event} event - The click event from the delete button.
 */
async function handleDeleteQuestion(event) {
    if (!isTeacherAuthorized) {
        showMessage("You are not authorized to delete questions.", false, messageBox);
        return;
    }

    const questionId = event.target.dataset.id;
    if (!questionId) {
        showMessage("Could not find question ID to delete.", false, messageBox);
        return;
    }

    const confirmDelete = await showCustomConfirm("Are you sure you want to delete this question?");
    if (!confirmDelete) {
        return;
    }

    try {
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        const questionDocRef = doc(db, `artifacts/${appId}/public/data/questions`, questionId);
        await deleteDoc(questionDocRef);
        showMessage("Question deleted successfully!", true, messageBox);
    } catch (error) {
        console.error("Error deleting question:", error);
        showMessage("Error deleting question. Please try again.", false, messageBox);
    }
}

/**
 * Populates the form with the data of the question to be edited.
 * @param {Event} event - The click event from the edit button.
 */
async function handleEditQuestion(event) {
    if (!isTeacherAuthorized) {
        showMessage("You are not authorized to edit questions.", false, messageBox);
        return;
    }

    const questionId = event.target.dataset.id;
    if (!questionId) {
        showMessage("Could not find question ID to edit.", false, messageBox);
        return;
    }

    const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
    const questionDocRef = doc(db, `artifacts/${appId}/public/data/questions`, questionId);

    try {
        const docSnap = await getDoc(questionDocRef);
        if (docSnap.exists()) {
            const questionData = docSnap.data();
            // Populate the form fields
            questionText.value = questionData.question;
            optionA.value = questionData.options.A;
            optionB.value = questionData.options.B;
            optionC.value = questionData.options.C;
            optionD.value = questionData.options.D;
            correctOption.value = questionData.correctAnswer;
            questionIdToEdit.value = questionId; // Store the ID of the question being edited

            // Change form title and button text
            formTitle.textContent = "Edit Question";
            submitQuestionBtn.textContent = "Update Question";
            cancelEditBtn.classList.remove('hidden'); // Show cancel button

            showMessage("Form populated for editing.", true, messageBox);
        } else {
            showMessage("Question not found for editing.", false, messageBox);
        }
    } catch (error) {
        console.error("Error fetching question for edit:", error);
        showMessage("Error loading question for edit. Please try again.", false, messageBox);
    }
}

/**
 * Resets the form to "Add New Question" mode.
 */
function cancelEdit() {
    addQuestionForm.reset(); // Clear the form
    questionIdToEdit.value = ''; // Clear the hidden ID
    formTitle.textContent = "Add New Question"; // Reset title
    submitQuestionBtn.textContent = "Add Question"; // Reset button text
    cancelEditBtn.classList.add('hidden'); // Hide cancel button
    showMessage("Edit cancelled. Ready to add new question.", true, messageBox);
}


// --- Student Page Specific Logic ---
let allQuestions = [];
let quizQuestions = [];
let currentQuestionIndex = 0;
let studentAnswers = [];
let timerInterval;
let timeLeft;

// DOM elements for student page
const configSection = document.getElementById('configSection');
const quizSection = document.getElementById('quizSection');
const resultsSection = document.getElementById('resultsSection');
const startTestBtn = document.getElementById('startTestBtn');
const numQuestionsInput = document.getElementById('numQuestions');
const timeLimitInput = document.getElementById('timeLimit');
const configMessageBox = document.getElementById('configMessageBox');
const studentIdInput = document.getElementById('studentId');
const previousResultsSection = document.getElementById('previousResultsSection');
const previousResultsList = document.getElementById('previousResultsList');

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
    if (studentIdInput) {
        // Fetch previous results whenever student ID changes
        studentIdInput.addEventListener('input', fetchAndDisplayPreviousResults);
        // Also fetch on initial load if an ID is pre-filled (e.g., from browser history)
        if (studentIdInput.value) {
            fetchAndDisplayPreviousResults();
        }
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
            if (startTestBtn) startTestBtn.disabled = true; // Disable start button if no questions
        } else {
            if (startTestBtn) startTestBtn.disabled = false;
        }
    } catch (error) {
        console.error("Error fetching all questions:", error);
        showMessage("Error loading questions. Please try again.", false, configMessageBox);
        if (startTestBtn) startTestBtn.disabled = true;
    }
}

/**
 * Starts the mock test.
 * Validates inputs, selects random questions, and displays the first question.
 */
async function startTest() {
    const studentId = studentIdInput ? studentIdInput.value.trim() : '';
    if (!studentId) {
        showMessage("Please enter your Student ID to start the test.", false, configMessageBox);
        return;
    }

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
    if (configSection) configSection.classList.add('hidden');
    if (previousResultsSection) previousResultsSection.classList.add('hidden'); // Hide previous results
    if (quizSection) quizSection.classList.remove('hidden');
    if (resultsSection) resultsSection.classList.add('hidden'); // Ensure results are hidden

    if (totalQuestionsNumSpan) totalQuestionsNumSpan.textContent = quizQuestions.length;
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
    if (currentQuestionNumSpan) currentQuestionNumSpan.textContent = currentQuestionIndex + 1;

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

    if (questionContainer) {
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
    }


    // Update navigation button states
    if (prevQuestionBtn) prevQuestionBtn.disabled = currentQuestionIndex === 0;
    if (currentQuestionIndex === quizQuestions.length - 1) {
        if (nextQuestionBtn) nextQuestionBtn.classList.add('hidden');
        if (submitTestBtn) submitTestBtn.classList.remove('hidden');
    } else {
        if (nextQuestionBtn) nextQuestionBtn.classList.remove('hidden');
        if (submitTestBtn) submitTestBtn.classList.add('hidden');
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
        if (timerSpan) timerSpan.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            submitTest();
            showMessage("Time's up! Your test has been submitted.", false, configMessageBox);
        }
    }, 1000);
}

/**
 * Submits the test, calculates results, and displays them.
 * Also saves the results to Firestore.
 */
async function submitTest() {
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
    if (resultsTotalQuestionsSpan) resultsTotalQuestionsSpan.textContent = totalQuestions;
    if (resultsCorrectSpan) resultsCorrectSpan.textContent = correctCount;
    if (resultsIncorrectSpan) resultsIncorrectSpan.textContent = incorrectCount;
    if (resultsScoreSpan) resultsScoreSpan.textContent = score;
    if (answerReviewDiv) answerReviewDiv.innerHTML = reviewHtml.join('');

    // Save results to Firestore
    const studentId = studentIdInput ? studentIdInput.value.trim() : 'anonymous';
    if (studentId && db) {
        try {
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
            const resultsCollectionRef = collection(db, `artifacts/${appId}/public/data/studentResults`);
            await addDoc(resultsCollectionRef, {
                studentId: studentId,
                totalQuestions: totalQuestions,
                correctAnswers: correctCount,
                incorrectAnswers: incorrectCount,
                score: parseFloat(score),
                timeTakenSeconds: (parseInt(timeLimitInput.value) * 60) - timeLeft, // Calculate time taken
                date: new Date(),
                // Store a simplified version of questions and answers for review
                quizDetails: quizQuestions.map((q, i) => ({
                    questionId: q.id,
                    questionText: q.question,
                    options: q.options,
                    correctAnswer: q.correctAnswer,
                    studentAnswer: studentAnswers[i]
                }))
            });
            console.log("Test results saved for student:", studentId);
            showMessage("Test submitted and results saved!", true, configMessageBox);
        } catch (error) {
            console.error("Error saving test results:", error);
            showMessage("Error saving test results. Please try again.", false, configMessageBox);
        }
    }


    // Show results section, hide quiz section
    if (quizSection) quizSection.classList.add('hidden');
    if (resultsSection) resultsSection.classList.remove('hidden');
}

/**
 * Resets the test to allow retaking.
 */
function resetTest() {
    // Hide results, show config
    if (resultsSection) resultsSection.classList.add('hidden');
    if (configSection) configSection.classList.remove('hidden');
    if (previousResultsSection) previousResultsSection.classList.remove('hidden'); // Show previous results again
    // Clear any previous messages
    if (configMessageBox) configMessageBox.classList.add('hidden');
    // Ensure start button is enabled if questions are available
    if (allQuestions.length > 0 && startTestBtn) {
        startTestBtn.disabled = false;
    }
    // Refresh previous results for the current student ID
    fetchAndDisplayPreviousResults();
}

/**
 * Fetches and displays previous test results for the entered Student ID.
 */
async function fetchAndDisplayPreviousResults() {
    const studentId = studentIdInput ? studentIdInput.value.trim() : '';
    if (!studentId || !db || !previousResultsList) {
        if (previousResultsList) previousResultsList.innerHTML = '<p class="text-gray-500">Enter a Student ID to see previous results.</p>';
        return;
    }

    if (previousResultsList) previousResultsList.innerHTML = '<p class="text-gray-500 text-center">Loading previous results...</p>';

    try {
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        const resultsCollectionRef = collection(db, `artifacts/${appId}/public/data/studentResults`);
        // Query for results matching the studentId
        const q = query(resultsCollectionRef, where("studentId", "==", studentId));
        const querySnapshot = await getDocs(q);

        if (previousResultsList) previousResultsList.innerHTML = ''; // Clear loading message

        if (querySnapshot.empty) {
            if (previousResultsList) previousResultsList.innerHTML = `<p class="text-gray-500 text-center">No previous results found for "${studentId}".</p>`;
            return;
        }

        querySnapshot.forEach(docSnap => {
            const result = docSnap.data();
            const date = result.date ? new Date(result.date.toDate()).toLocaleString() : 'N/A';
            const timeTaken = result.timeTakenSeconds ? `${Math.floor(result.timeTakenSeconds / 60)}m ${result.timeTakenSeconds % 60}s` : 'N/A';

            const resultCard = document.createElement('div');
            resultCard.className = 'bg-white p-4 rounded-lg shadow border border-gray-100 mb-2';
            resultCard.innerHTML = `
                <p class="font-semibold text-gray-800">Date: ${date}</p>
                <p>Score: <span class="text-blue-600 font-bold">${result.score}%</span></p>
                <p>Correct: ${result.correctAnswers} / ${result.totalQuestions}</p>
                <p>Time Taken: ${timeTaken}</p>
            `;
            if (previousResultsList) previousResultsList.appendChild(resultCard);
        });

    } catch (error) {
        console.error("Error fetching previous results:", error);
        if (previousResultsList) previousResultsList.innerHTML = '<p class="text-red-500 text-center">Error loading previous results.</p>';
    }
}


// Initialize Firebase when the window loads
window.onload = initializeFirebaseAndAuth;
