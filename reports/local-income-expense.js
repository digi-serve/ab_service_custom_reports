/**
 * localIncomeExpense
 *
 *
 */
const fs = require("fs");
const path = require("path");

module.exports = {
   // GET: /report/local-income-expense
   // get the local and expense income and calculate the sums
   prepareData: async (AB, { team, rc, fyYear, fyMonth }, req) => {
      const ids = {
         myTeamsQueryId: "62a0c464-1e67-4cfb-9592-a7c5ed9db45c",
         myRCsQueryId: "241a977c-7748-420d-9dcb-eff53e66a43f",
         myRCsTeamFieldId: "ae4ace97-f70c-4132-8fa0-1a0b1a9c7859",
         balanceObjId: "bb9aaf02-3265-4b8c-9d9a-c0b447c2d804",
         yearObjId: "6c398e8f-ddde-4e26-b142-353de5b16397",
      };

      // Our data object
      var data = {
         title: {
            en: "Local Income vs Expense",
            zh: "本地收入VS 支出",
         },
         rc: rc,
         total: {
            en: "Total",
            zh: "总额",
         },
         category: {
            en: "Category",
            zh: "类别",
         },
         categories: [
            {
               parent: 4111,
               type: "Local Income",
               translation: {
                  en: "Local Income ",
                  zh: "本地收入",
               },
               sub: [
                  {
                     id: 41113,
                     translation: {
                        en: "General Contribution Local From Ch",
                        zh: "本地收到给事工的捐款-从国内收到",
                     },
                  },
                  {
                     id: 41114,
                     translation: {
                        en: "General Contribution Local From Oversea",
                        zh: "本地收到给事工的捐款-收到海外的汇款",
                     },
                  },
               ],
            },
            {
               parent: 7,
               type: "Expenses",
               translation: {
                  en: "Expenses ",
                  zh: "支出",
               },
               sub: [
                  {
                     id: 71,
                     translation: {
                        en: "Personnel expenses",
                        zh: "工资/福利",
                     },
                  },
                  {
                     id: 72,
                     translation: {
                        en: "Conferences and meetings",
                        zh: "大会和会议费用",
                     },
                  },
                  {
                     id: 75,
                     translation: {
                        en: "Travel and transportation",
                        zh: "差旅费",
                     },
                  },
                  {
                     id: 81,
                     translation: {
                        en: "Supplies and non-capitalized equipment",
                        zh: "设备及维修保养",
                     },
                  },
                  {
                     id: 82,
                     translation: {
                        en: "Communications",
                        zh: "电话和通信",
                     },
                  },
                  {
                     id: 84,
                     translation: {
                        en: "Professional services",
                        zh: "专业费用",
                     },
                  },
                  {
                     id: 86,
                     translation: {
                        en: "Capital expenses",
                        zh: "固定资产支出",
                     },
                  },
                  {
                     id: 87,
                     translation: {
                        en: "Facilities",
                        zh: "设施费用",
                     },
                  },
                  {
                     id: 89,
                     translation: {
                        en: "Other expenses",
                        zh: "其他费用",
                     },
                  },
               ],
            },
         ],
      };

      // get our passed params
      data.team = team ? team : undefined;
      data.rc = rc ? rc : undefined;
      data.fyYear = fyYear ? fyYear : undefined;
      data.fyMonth = fyMonth ? fyMonth : undefined;

      function accountInCategory(account, category) {
         const accountDigits = account?.toString().split("") ?? [];
         const categoryDigits = category?.toString().split("") ?? [];
         let match = true;
         categoryDigits.forEach((digit, i) => {
            if (digit !== accountDigits[i]) {
               match = false;
            }
         });
         return match;
      }

      function categorySum(category, balances) {
         const filtered = balances.filter((bal) =>
            accountInCategory(bal["COA Num"], category)
         );
         if (filtered.length > 0) {
            return filtered
               .map((i) => i["Running Balance"])
               .reduce((a, b) => (100 * a + 100 * b) / 100);
         } else {
            return 0;
         }
      }

      function getMonthList() {
         var array = [
            "01",
            "02",
            "03",
            "04",
            "05",
            "06",
            "07",
            "08",
            "09",
            "10",
            "11",
            "12",
         ];

         // array.sort();
         return array;
      }

      function sort(a, b) {
         return (a ?? "").toLowerCase().localeCompare((b ?? "").toLowerCase());
      }

      const myTeams = AB.queryByID(ids.myTeamsQueryId).model();
      const myRCs = AB.queryByID(ids.myRCsQueryId).model();
      const balanceObj = AB.objectByID(ids.balanceObjId).model();
      const yearObj = AB.objectByID(ids.yearObjId).model();

      // Load Options
      const [teamsArray, rcs, yearArray] = await Promise.all([
         // return teams
         myTeams.findAll(
            {
               populate: false,
            },
            { username: req._user.username },
            AB.req
         ),
         // return myRCs
         myRCs.findAll(
            {
               where: {
                  glue: "and",
                  rules: team
                     ? [
                          {
                             key: ids.myRCsTeamFieldId,
                             rule: "equals",
                             value: team,
                          },
                       ]
                     : [],
               },
               populate: false,
            },
            { username: req._user.username },
            AB.req
         ),
         // return year
         yearObj.findAll(
            {
               populate: false,
            },
            { username: req._user.username },
            AB.req
         ),
      ]);

      data.teamOptions = (teamsArray ?? [])
         .map((t) => t["BASE_OBJECT.Name"])
         .filter(function (team, ft, tl) {
            return tl.indexOf(team) == ft;
         })
         .sort(sort);

      data.rcOptions = (rcs ?? [])
         .map((t) => t["BASE_OBJECT.RC Name"])
         // Remove duplicated RC
         .filter(function (rc, pos, self) {
            return self.indexOf(rc) == pos;
         })
         .sort(sort);

      data.yearOptions = (yearArray ?? []).map((t) => t["FYear"]).sort(sort);

      data.monthOptions = getMonthList(AB);

      // Load Report Data
      const where = {
         glue: "and",
         rules: [],
      };

      // Select a specified RC
      if (rc) {
         where.rules.push({
            key: "RC Code",
            rule: "equals",
            value: rc,
         });
      }
      // All of RC of a selected TEAM
      else {
         where.rules.push({
            key: "RC Code",
            rule: "in",
            value: data.rcOptions,
         });
      }

      if (fyMonth) {
         const year = fyYear || new Date().getFullYear();
         const monthJoin = `FY${year?.toString().slice(-2)} M${fyMonth}`;
         where.rules.push({
            key: "FY Period",
            rule: "contains",
            value: monthJoin,
         });
      }

      let records = [];
      if (data.team && where?.rules?.length) {
         records = await balanceObj.findAll(
            {
               where: where,
               populate: false,
            },
            { username: req._user.username },
            AB.req
         );
      }

      data.categories.forEach((cat) => {
         let catSum = 0;
         cat.sub.forEach((sub) => {
            sub.sum = categorySum(sub.id, records);
            catSum = (100 * sub.sum + 100 * catSum) / 100;
         });
         cat.sum = catSum.toFixed(2);
      });

      // Local Income / Expenses
      let localIncomeSum = data.categories[0].sum;
      let expensesSum = data.categories[1].sum;

      data.localPercentage = Math.floor((localIncomeSum / expensesSum) * 100);

      // if either number is zero, percentage won't calculate correctly
      if (expensesSum == 0) {
         // 100 of expenses are covered by local
         data.localPercentage = 0;
      } else if (localIncomeSum == 0) {
         // there is no local income, so so no expenses are covered
         data.localPercentage = 0;
      }

      return data;
   },
   template: () => {
      return fs.readFileSync(
         path.join(__dirname, "templates", "local-income-expense.ejs"),
         "utf8"
      );
   },
};
