const bcrypt = require('bcryptjs');
bcrypt.hash('admin1234', 10).then(hash => console.log(hash));
