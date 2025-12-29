const db = require('../include/db.js');

(async () => {
  try {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;

    console.log('Testing isTradingDay for', dateStr);
    const isTD = await db.isTradingDay(dateStr);
    console.log('isTradingDay =>', isTD);
  } catch (err) {
    console.error('Error running test:', err);
  }
})();
