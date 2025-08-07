// Firebase 初期設定
const firebaseConfig = {
  apiKey: "AIzaSyCbEExkec_G68pY1C6MWl_R0yeAxjQdVMI",
  authDomain: "quiz-app-mslogin.firebaseapp.com",
  projectId: "quiz-app-mslogin"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

let currentUser = null;
let currentAttemptRef = null; // 今回の挑戦（attempts）のリファレンス
let questions = [];
let shuffledQuestions = [];
let currentQuestionIndex = 0;
let sessionStats = {
  answerCount: 0,
  correctCount: 0
};
let highScore = 0; // ハイスコア表示用
let HasAnswered = false;

// Microsoft アカウントでログイン　→ ユーザー情報取得・保存・ステータス初期化まで
function signInWithMicrosoft() {
  const provider = new firebase.auth.OAuthProvider('microsoft.com');

  firebase.auth().signInWithPopup(provider).then((result) => {
    const user = result.user;
    currentUser = user;

    // ニックネーム生成
    const email = user.email || "";
    const namePart = user.displayName?.substring(0, 2) || "";
    const midPart = email.substring(2, 4);
    const atIndex = email.indexOf("@");
    const endPart = (atIndex >= 3) ? email.substring(atIndex - 3, atIndex) : "";
    const nickname = `${namePart}${midPart}${endPart}`;

    const userRef = db.collection("users").doc(user.uid);

    userRef.get().then(doc => {
      const isNewUser = !doc.exists;

      const userData = {
        nickname: nickname,
        displayName: user.displayName,
        email: email,
        lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
        usageCount: firebase.firestore.FieldValue.increment(1)
      };

      if (isNewUser) {
        userData.answerCount = 0;
        userData.correctCount = 0;
        userData.accuracyRate = 0;
        userData.score = 0;
      }

      // 更新 & ステータスバー表示
      userRef.set(userData, { merge: true }).then(() => {
        document.getElementById('nickname').textContent = nickname;

        // ハイスコアを一時保存しておく
        userRef.get().then(doc => {
          const data = doc.data();
          highScore = data.score || 0;

          // attempts コレクションにセッション記録（初期値）
          db.collection("attempts").add({
            uid: user.uid,
            nickname: data.nickname || "名無し",
            displayName: data.displayName || "",
            usageCount: data.usageCount || 1,  // ★ usageCount を attempts に保存
            answerCount: 0,
            correctCount: 0,
            accuracyRate: 0,
            score: 0,
            startedAt: firebase.firestore.FieldValue.serverTimestamp()
          }).then(ref => {
            currentAttemptRef = ref;
            sessionStats = { answerCount: 0, correctCount: 0 };
            updateStatusBar(); // 初期ステータス表示
            showScreen("quiz-screen");
            fetchQuestions();
          });
        });
      });
    });
  }).catch((error) => {
    alert("ログインエラー: " + error.message);
  });
}

// ステータスバーの表示更新
function updateStatusBar() {
  const accuracy = sessionStats.answerCount > 0
    ? Math.round((sessionStats.correctCount / sessionStats.answerCount) * 100)
    : 0;

  const score = sessionStats.correctCount * 100;

  document.getElementById("uid").textContent = currentUser.uid;
  document.getElementById("answerCount").textContent = sessionStats.answerCount;
  document.getElementById("correctCount").textContent = sessionStats.correctCount;
  document.getElementById("accuracyRate").textContent = accuracy;
  document.getElementById("score").textContent = `${score}（ハイスコア${highScore}）`;
}

// 問題読み込みとシャッフル
function fetchQuestions() {
  fetch("questions.json")
    .then(response => response.json())
    .then(data => {
      questions = data;
      shuffledQuestions = shuffleArray(questions);
      currentQuestionIndex = 0; // 初期化を忘れずに
      showQuestion(shuffledQuestions[currentQuestionIndex]); 
    });
}


// 配列シャッフル関数
function shuffleArray(array) {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}

// 問題表示
function showQuestion(questionData) {
  const questionElem = document.getElementById('question');
  const choicesElem = document.getElementById('choices');
  const nextBtn = document.getElementById('next-btn');
  const rankingBtn = document.getElementById('ranking-btn');

  // 表示クリア
  questionElem.textContent = `${currentQuestionIndex + 1}. ${questionData.question}`;
  choicesElem.innerHTML = '';

  // 選択肢ボタン作成
  questionData.choices.forEach(choice => {
    const btn = document.createElement('button');
    btn.textContent = choice;
    btn.classList.add('choice-btn');
    btn.dataset.originalText = choice;

    btn.onclick = () => handleAnswer(btn, choice, questionData.answer);

    choicesElem.appendChild(btn);
  });

  nextBtn.style.display = 'block';
  rankingBtn.style.display = 'none';
}


// 解答時の処理
function handleAnswer(button, selected, correct) {
  const buttons = document.querySelectorAll('.choice-btn');
  let isCorrect = false;

  buttons.forEach(btn => {
    btn.disabled = true;
    if (btn.textContent === correct) {
      btn.classList.add('correct');
      if (btn === button) isCorrect = true;
    } else if (btn === button) {
      btn.classList.add('incorrect');
    }
  });

  updateStats(isCorrect);
}

// スコア更新処理（usersとattempts）
function updateStats(isCorrect) {
  sessionStats.answerCount++;
  sessionStats.correctCount += isCorrect ? 1 : 0;

  updateStatusBar();

  const accuracy = Math.round((sessionStats.correctCount / sessionStats.answerCount) * 100);
  const score = sessionStats.correctCount * 100;

  // attempts に現在のセッション状態を上書き保存
  if (currentAttemptRef) {
    currentAttemptRef.set({
      answerCount: sessionStats.answerCount,
      correctCount: sessionStats.correctCount,
      accuracyRate: accuracy,
      score: score,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }

  // users にハイスコアが更新された場合のみ記録
  if (!currentUser) return; // ← ユーザーログインがなかったら処理を抜ける
  const userRef = db.collection("users").doc(currentUser.uid);
  userRef.get().then(doc => {
    const data = doc.data();
    const previousHigh = data.score || 0;

    if (score > previousHigh) {
      userRef.set({
        score: score,
        answerCount: sessionStats.answerCount,
        correctCount: sessionStats.correctCount,
        accuracyRate: accuracy
      }, { merge: true });

      highScore = score; // 表示用も更新
      updateStatusBar();
    }
  });
}

// 次の問題へ
function loadNextQuestion() {
  // 未ログインまたは問題リスト未取得
  if (!currentUser || !shuffledQuestions || shuffledQuestions.length === 0) {
    showScreen('login-screen');
    return;
  }

  currentQuestionIndex++;

  // 全問終了
  if (currentQuestionIndex >= shuffledQuestions.length) {
    document.getElementById("question").textContent = "すべての問題を回答しました。";
    document.getElementById("choices").innerHTML = "";
    document.getElementById("next-btn").style.display = "none";
    document.getElementById("ranking-btn").style.display = "inline-block";
    return;
  }

  // 回答状態リセット
  HasAnswered = false;
  resetChoiceButtons();

  // 次の問題表示
  showQuestion(shuffledQuestions[currentQuestionIndex]);
}

// ボタン選択を初期化する
function resetChoiceButtons() {
  const choiceContainer = document.getElementById("choices");
  const buttons = choiceContainer.querySelectorAll("button");

  buttons.forEach(btn => {
    btn.disabled = false;
    btn.style.backgroundColor = "";
    btn.textContent = btn.dataset.originalText || btn.textContent.replace(/[〇×]/g, "");
  });
}


// 画面切り替え用
function showScreen(id) {
  // 未ログインで quiz-screen に行こうとしたら強制ログイン画面
  if (id === 'quiz-screen' && !currentUser) {
    id = 'login-screen';
  }

  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');

  // 画面別処理
  if (id === 'ranking-screen') {
    loadRanking();
  } else if (id === 'login-screen') {
    // 念のためボタンを非表示
    document.getElementById("next-btn").style.display = "none";
    document.getElementById("ranking-btn").style.display = "none";
  }
}



// ランキング表示用
function loadRanking() {
  const tbody = document.getElementById("ranking-body");
  tbody.innerHTML = "";

  db.collection("users")
    .orderBy("score", "desc")
    .limit(50)
    .get()
    .then(snapshot => {
      let rank = 1;
      snapshot.forEach(doc => {
        const data = doc.data();
        const row = document.createElement("tr");
        row.innerHTML = `
          <td>${rank++}</td>
          <td>${data.nickname || "名無し"}</td>
          <td>${data.score || 0}</td>
          <td>${data.accuracyRate || 0}%</td>
          <td>${data.answerCount || 0}</td>
          <td>${data.usageCount || 0}</td>
        `;
        tbody.appendChild(row);
      });
    });
}


// ハンバーガーメニューの表示切替
document.getElementById('menu-toggle').addEventListener('click', () => {
  const dropdown = document.getElementById('menu-dropdown');
  dropdown.classList.toggle('show');
});

// ナビゲーション関数
function navigateTo(page) {
  // メニューを閉じる
  document.getElementById('menu-dropdown').classList.remove('show');

  // 画面切り替え
  if (page === 'quiz') {
    showScreen('quiz-screen');
  } else if (page === 'ranking') {
    showScreen('ranking-screen');
  }
}
