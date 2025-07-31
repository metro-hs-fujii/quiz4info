let questions = [];

fetch('questions.json')
  .then(response => response.json())
  .then(data => {
    questions = data;
    loadQuestion(currentIndex);
  });

let currentIndex = 0;

function loadQuestion(index) {
  const q = questions[index];
  document.getElementById("question").textContent = `${index + 1}. ${q.question}`;
  const choicesContainer = document.getElementById("choices");
  choicesContainer.innerHTML = "";

  q.choices.forEach(choice => {
    const btn = document.createElement("button");
    btn.textContent = choice;
    btn.className = "choice-btn";
    btn.onclick = () => handleAnswer(btn, choice === q.answer);
    choicesContainer.appendChild(btn);
  });
}

function handleAnswer(button, isCorrect) {
  const buttons = document.querySelectorAll(".choice-btn");
  buttons.forEach(btn => {
    btn.disabled = true;
    if (btn.textContent === questions[currentIndex].answer) {
      btn.classList.add("correct");
    } else if (btn === button) {
      btn.classList.add("incorrect");
    }
  });
}

function loadNextQuestion() {
  currentIndex++;
  if (currentIndex >= questions.length) {
    alert("全ての問題が終了しました！");
    currentIndex = 0;
  }
  loadQuestion(currentIndex);
}
