const bcrypt = require('bcryptjs');

async function main() {
  const hash = await bcrypt.hash('Admin1234!', 10);
  console.log('Hash:', hash);
}

main();