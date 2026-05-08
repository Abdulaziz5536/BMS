const fs = require('fs');
const path = require('path');

const routesDir = path.join(__dirname, 'backend', 'routes');
let verificationFailed = false;

fs.readdirSync(routesDir)
  .filter((file) => file.endsWith('.js'))
  .forEach((file) => {
    const routePath = path.join(routesDir, file);
    try {
      require(routePath);
      console.log(`Loaded route: ${file}`);
    } catch (error) {
      verificationFailed = true;
      console.error(`Failed loading route: ${file}`);
      console.error(error);
    }
  });

if (verificationFailed) {
  console.error('Backend route verification failed.');
  process.exit(1);
}

console.log('Backend routes loaded ok');
