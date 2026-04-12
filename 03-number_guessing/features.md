# Additional Features

The following contains some ideas on how to improve this project further

## Set Game Attributes
```
let min, max, target;
let attemptsLeft;
let maxAttempts = 5;
let score = 0;
```

## 1. Enable Reset of the Game

Use this to replace the initialization so that it can be  called multiple times to reset.

```
function initGame()
{
	min = Math.floor(Math.random() * 50) + 1;
	max = min + Math.floor(Math.random() * 50) + 10;
	target = Math.floor(Math.random() * (max - min + 1)) + min;
    // Generate range and target

	attemptsLeft = maxAttempts; // Reset attempts

	answerDiv.textContent = `Guess a number between ${min} and ${max}. Attempts left: ${attemptsLeft}`;

	console.log(`Debug: ${target}`);
}
```

Add a reset button in the HTML file:

```
<button id="restartBtn">Restart Game</button>
```

Add an Event Listener in the JavaScript file to respond to the reset button onclick:

```
restartBtn.addEventListener("click", initGame);
```

**Important:** Do not forget to add a line of code to call the function and initialize the game for the first time:

```
initGame();
```

## 2. Add attempts limit and scoring

Replace the submit logic with this ```handleGuess()``` function:

```
function handleGuess(guess)
{
	// User attempts to guess after game has ended
	if (attemptsLeft <= 0)
	{
		answerDiv.textContent = "No attempts left! Click restart.";
		return;
	}

	attemptsLeft--;

	if (guess < target)
	{
		answerDiv.textContent = `Too small! Attempts left: ${attemptsLeft}`;
	}
	else if (guess > target)
	{
		answerDiv.textContent = `Too big! Attempts left: ${attemptsLeft}`;
	}
	else
	{
		score += attemptsLeft + 1; // reward faster guesses
		answerDiv.textContent = `🎉 Correct! Score: ${score}`;
		attemptsLeft = 0; // end round
		return;
	}

	if (attemptsLeft === 0)
	{
		answerDiv.textContent = `Game over! The number was ${target}. Score: ${score}`;
	}
}
```