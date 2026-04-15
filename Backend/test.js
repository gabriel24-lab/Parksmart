const msnodesqlv8 = require('msnodesqlv8');

const connStr = "Driver={ODBC Driver 17 for SQL Server};Server=GABRIEL;Database=ParqueaderoSENA;Trusted_Connection=yes;";

msnodesqlv8.open(connStr, (err, conn) => {
  if (err) {
    console.error('❌ Error:', err.message);
  } else {
    console.log('✅ Conexión exitosa');
    conn.close();
  }
});