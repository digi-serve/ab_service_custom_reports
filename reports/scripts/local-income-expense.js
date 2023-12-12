const title = "<%= title[languageCode] %>",
   domId = "local-income-expense-report",
   frameId = "local-income-expense-report-frame";

const optInstance = new TeamRcFyOptions(title, domId, frameId);
optInstance.generateUI();
optInstance.getURL = (teamVal, rcVal, startVal, endVal) =>
   `/report/local-income-expense?Teams=${teamVal}&RCs=${rcVal}&start=${startVal}&end=${endVal}`;
