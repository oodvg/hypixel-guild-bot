module.exports = {
  apps: [{
    script: 'index.js',
    name: "HGB",
    max_memory_restart: '2G',
    args: [
      "--color"
    ],
    log_date_format: "YYYY-MM-DD HH:mm Z"
  }],
};
