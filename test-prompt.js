require('dotenv').config();
const readline = require('readline');
const { askOpenRouter } = require('./lib/openrouter');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const history = [];

console.log('CookConnect System Prompt Tester');
console.log('Type "exit" to quit, "clear" to reset history\n');

function prompt() {
  rl.question('You: ', async (text) => {
    const trimmed = text.trim();
    if (trimmed === 'exit') { rl.close(); return; }
    if (trimmed === 'clear') { history.length = 0; console.log('History cleared.\n'); prompt(); return; }
    if (!trimmed) { prompt(); return; }

    try {
      const reply = await askOpenRouter({ text: trimmed, history });
      history.push({ role: 'user', text: trimmed });
      history.push({ role: 'assistant', text: reply });
      console.log(`\nBot: ${reply}\n`);
    } catch (err) {
      console.error(`Error: ${err.message}\n`);
    }
    prompt();
  });
}

prompt();
