// Generate a random range
const min = Math.floor(Math.random() * 50) + 1;       // 1–50
const max = min + Math.floor(Math.random() * 50) + 25; // ensure range width

// Generate the target number within the range
const target = Math.floor(Math.random() * (max - min + 1)) + min;

// console.log(`Debug: number is ${target} (range ${min}-${max})`);

const form = document.querySelector("form");
const input = document.getElementById("userinput");
const answerDiv = document.getElementById("answer");

// Show initial instruction
answerDiv.textContent = `Guess a number between ${min} and ${max}`;

form.addEventListener("submit", function(event) {
	event.preventDefault(); // stop page reload

	const guess = Number(input.value);

	// Validate input
	if (isNaN(guess)) {
		answerDiv.textContent = "Please enter a valid number.";
		return;
	}

	// Compare guess
	if (guess < target) {
		answerDiv.textContent = "Too small! Try again.";
	} else if (guess > target) {
		answerDiv.textContent = "Too big! Try again.";
	} else {
		answerDiv.textContent = `🎉 Correct! The number was ${target}.`;
	}

	// Clear input
	input.value = "";
});