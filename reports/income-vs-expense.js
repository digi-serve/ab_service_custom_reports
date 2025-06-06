/**
 * localIncomeExpense
 *
 *
 */

const path = require("path");
const fs = require("fs");
const utils = require("./_utils");

function getPreviousFY(fyPeriod) {
   let Y = fyPeriod?.split(" ")[0]?.replace("FY", "");
   let M = fyPeriod?.split(" ")[1]?.replace("M", "");

   if (Y == null || M == null) return;

   Y = parseInt(Y);
   M = parseInt(M);

   if (M == 1) {
      Y -= 1;
      M = 12;
   }
   else {
      M -= 1;
   }

   return `FY${Y} M${M < 10 ? `0${M}` : M}`;
}

module.exports = {
   // GET: /report/local-income-expense
   // get the local and expense income and calculate the sums
   prepareData: async (AB, { fyperstart, fyperend }) => {
      // Object Ids
      const ids = {
         balanceID: "bb9aaf02-3265-4b8c-9d9a-c0b447c2d804",
         fiscalMonthID: "1d63c6ac-011a-4ffd-ae15-97e5e43f2b3f",
      };

      const data = {};
      data.fyperstart = fyperstart;
      data.fyperend = fyperend;

      // If start option is FY M01, then it should read data from end FY
      if (fyperstart?.indexOf("M01") > -1)
         fyperstart = null;

      /**
      /* @const balances
      /* aka GL Segments. Should be filtered by the fiscal period the report is based on.
      /* mcc_code: balance link to rc, rc link to mcc, mcc has a code. The rc code should
      /* should start with mcc code.
      */
      let balances = [];

      /**
      /* @const mccs
      /* Can read from the MCC object
      */
      const mccs = [
         { code: "01", label: "Staff" },
         { code: "02", label: "SLM" },
         { code: "03", label: "Digital Strategies" },
         { code: "04", label: "LeaderImpact" },
         { code: "05", label: "GCM" },
         { code: "06", label: "Resource ministries" },
         { code: "07", label: "LDHR" },
         { code: "08", label: "Fund development" },
         { code: "09", label: "Operations" },
         { code: "10", label: "National Leadership" },
         { code: "11", label: "Other" },
         { code: "12", label: "None" },
      ];

      function calculateGroupSums(...groups) {
         let sums = [];
         for (let m = 0; m < mccs.length; m++) {
            let sum = 0;
            for (let b = 0; b < balances.length; b++) {
               const balance = balances[b];
               let inGroup = false;
               let isExpense = false;
               for (let g = 0; g < groups.length; g++) {
                  if (!balance["COA Num"]) continue;

                  if (accountInCategory(balance["COA Num"], groups[g])) {
                     inGroup = true;

                     // check if item is expense so we can subtract from sum later
                     if (accountInCategory(balance["COA Num"], 95)) {
                        isExpense = true;
                     }
                  }
               }

               if (
                  inGroup &&
                  balance["Running Balance"] &&
                  balance["RCCode__relation"]?.["MCCcode"] == mccs[m].code
               ) {
                  const sumx100 = 100 * sum;
                  let runningBalance = 100 * balance["Running Balance"];

                  if (fyperstart && balance["FY Period"] == fyperstart)
                     runningBalance *= -1;

                  if (isExpense) {
                     sum = sumx100 - runningBalance;
                  } else {
                     sum = sumx100 + runningBalance;
                  }

                  sum = sum / 100;
               }
            }
            sums.push(sum);
         }
         let totalSum = 0;
         for (let s = 0; s < sums.length; s++) {
            totalSum = (100 * sums[s] + 100 * totalSum) / 100;
         }
         sums.push(totalSum);

         return sums;
      }

      /**
      /* Check whether an a category. The first digits of the account should match the category.
      /* @function accountInCategory
      /* @param {int} account 4-5 digit
      /* @param {int} category 3-4 digits
      /* @return {bool}
     */
      function accountInCategory(account, category) {
         return (account ?? "").toString().startsWith(category);
         // const accountDigits = account.toString().split("");
         // const categoryDigits = category.toString().split("");
         // let match = true;
         // categoryDigits.forEach((digit, i) => {
         //    if (digit !== accountDigits[i]) {
         //       match = false;
         //    }
         // });
         // return match;
      }

      const fiscalMonthObj = AB.objectByID(ids.fiscalMonthID).model();

      let fiscalMonthsArray = await fiscalMonthObj
         .find({
            where: {
               glue: "or",
               rules: [
                  // Active
                  {
                     key: "Status",
                     rule: "equals",
                     value: "1592549785939",
                  },
                  // Closed
                  {
                     key: "Status",
                     rule: "equals",
                     value: "1592549786113",
                  },
               ],
            },
            populate: false,
            sort: [
               {
                  key: "49d6fabe-46b1-4306-be61-1b27764c3b1a",
                  dir: "DESC",
               },
            ],
            limit: 15,
         });

      data.fyperOptions = fiscalMonthsArray.map((fp) => {
         const fyPeriod = fp["FY Per"];
         return {
            value: fyPeriod,
            label: `${fyPeriod} - [${utils.convertFYtoDate(fyPeriod)}]`
         }
      });

      // Pull previous FY period to calculate
      // https://github.com/CruGlobal/ns_app/issues/452
      if (fyperstart)
         fyperstart = getPreviousFY(fyperstart);

      if (data.fyperend) {
         const balanceObj = AB.objectByID(ids.balanceID).model();
         balances = await balanceObj.findAll(
            {
               where: {
                  glue: "or",
                  rules: [
                     // TODO replace these rules @achoobert
                     // rc seems to not be defined for income vs expense?
                     // {
                     //    key: "RC Code",
                     //    rule: "equals",
                     //    value: rc,
                     // },
                     fyperstart ? {
                        key: "FY Period",
                        rule: "equals",
                        value: fyperstart,
                     } : null,
                     data.fyperend ? {
                        key: "FY Period",
                        rule: "equals",
                        value: data.fyperend,
                     } : null,
                  ],
               },
               populate: ["RC Code"],
            },
            { username: AB.id },
            AB.req
         );
      }

      // Calculate Net Income Values
      let incomeReceivedTotals = calculateGroupSums(4, 5);
      let incomeTransferTotals = calculateGroupSums(6);
      // let expenseTotals = calculateGroupSums(6, 7, 8, 9);
      let expenseTotals = calculateGroupSums(7, 8);
      let internalTransferTotals = calculateGroupSums(9);

      data.mccs = mccs;
      data.fnValueFormat = utils.valueFormat;
      data.numberOfColumns = mccs.length + 2;
      data.accountGroups = [
         {
            label: {
               en: "Local Income",
               zh: "本地收入",
            },
            total: {
               en: "Total Local Income",
               zh: "本地总收入",
            },
            account: "4000",
            sums: calculateGroupSums(4),
            subGroups: [
               {
                  label: {
                     en: "Local Income",
                     zh: "本地收入",
                  },
                  account: "4100",
                  sums: calculateGroupSums(41),
               },
               {
                  label: {
                     en: "Product sales",
                     zh: "产品销售",
                  },
                  account: "4300",
                  sums: calculateGroupSums(43),
               },
               {
                  label: {
                     en: "Program Income",
                     zh: "会议和项目收入",
                  },
                  account: "4400",
                  sums: calculateGroupSums(44),
               },
               {
                  label: {
                     en: "Other Income",
                     zh: "其他收入",
                  },
                  account: "4900",
                  sums: calculateGroupSums(49),
               },
            ],
         },
         {
            label: {
               en: "Income from CCC",
               zh: "来自3C的收入",
            },
            total: {
               en: "Total Income from CCC",
               zh: "来自3C的总收入",
            },
            account: "5000",
            sums: calculateGroupSums(5),
            subGroups: [
               {
                  label: {
                     en: "Contributions from other CCC",
                     zh: "通过其他CCC收到的捐款",
                  },
                  account: "5100",
                  sums: calculateGroupSums(51),
               },
               {
                  label: {
                     en: "Subsidy funding from other CCC",
                     zh: "来自其他CCC的补贴和拨款",
                  },
                  account: "5600",
                  sums: calculateGroupSums(56),
               },
            ],
         },
         {
            label: {
               en: "",
               zh: "",
            },
            total: {
               en: "Total Income Received",
               zh: "总收入",
            },
            account: "4000 & 5000",
            sums: incomeReceivedTotals,
         },
         {
            label: {
               en: "Income transfer to CCC",
               zh: "转给其他3C的支出",
            },
            total: {
               en: "Total Income transfer to CCC",
               zh: "转给其他3C的总支出",
            },
            account: "6000",
            sums: incomeTransferTotals,
            subGroups: [
               {
                  label: {
                     en: "Contributions to other CCC",
                     zh: "给其他CCC的捐款转出",
                  },
                  account: "6100",
                  sums: calculateGroupSums(61),
               },
               {
                  label: {
                     en: "Subsidy funding to other CCC",
                     zh: "给其他CCC的补贴拨款转出",
                  },
                  account: "6600",
                  sums: calculateGroupSums(66),
               },
            ],
         },
         {
            label: {
               en: "Expenses",
               zh: "支出费用",
            },
            total: {
               en: "Total Expenes",
               zh: "总支出费用",
            },
            account: "7000 & 8000",
            sums: expenseTotals,
            subGroups: [
               {
                  label: {
                     en: "Personnel expenses",
                     zh: "工资和员工福利",
                  },
                  account: "7100",
                  sums: calculateGroupSums(71),
               },
               {
                  label: {
                     en: "Conferences and meetings",
                     zh: "大会和会议费用",
                  },
                  account: "7200",
                  sums: calculateGroupSums(72),
               },
               {
                  label: {
                     en: "Travel and transportation",
                     zh: "差旅费",
                  },
                  account: "7500",
                  sums: calculateGroupSums(75),
               },
               {
                  label: {
                     en: "Supplies and non-capitalized equipment",
                     zh: "用品和设备以及设备维修和保养",
                  },
                  account: "8100",
                  sums: calculateGroupSums(81),
               },
               {
                  label: {
                     en: "Communications",
                     zh: "电话和通信",
                  },
                  account: "8200",
                  sums: calculateGroupSums(82),
               },
               {
                  label: {
                     en: "Professional services",
                     zh: "专业费用",
                  },
                  account: "8400",
                  sums: calculateGroupSums(84),
               },
               {
                  label: {
                     en: "Capital expenses",
                     zh: "固定资产支出",
                  },
                  account: "8600",
                  sums: calculateGroupSums(86),
               },
               {
                  label: {
                     en: "Facilities",
                     zh: "设施费用",
                  },
                  account: "8700",
                  sums: calculateGroupSums(87),
               },
               {
                  label: {
                     en: "Other expenses",
                     zh: "其他费用",
                  },
                  account: "8900",
                  sums: calculateGroupSums(89),
               },
            ],
         },
         {
            label: {
               en: "Internal Transfers",
               zh: "内部转账",
            },
            total: {
               en: "Total Internal Transfers",
               zh: "内部转账总费用",
            },
            account: "9000",
            sums: internalTransferTotals,
            subGroups: [
               {
                  label: {
                     en: "Internal income transfers",
                     zh: "内部转账收入",
                  },
                  account: "9100",
                  sums: calculateGroupSums(91),
               },
               {
                  label: {
                     en: "Internal expense transfers",
                     zh: "内部转账支出",
                  },
                  account: "9500",
                  sums: calculateGroupSums(95),
               },
            ],
         },
      ];

      let netTotals = [];
      for (let i = 0; i < incomeReceivedTotals.length; i++) {
         // Total Income Received - Total Income transfer to CCC - Total Expenses + Total Internal Transfers
         let val =
            (100 * incomeReceivedTotals[i] -
               100 * incomeTransferTotals[i] -
               100 * expenseTotals[i] +
               100 * internalTransferTotals[i]) /
            100;
         netTotals.push(val);
      }
      data.netTotals = netTotals;
      let balSheetTotal = 0;
      for (let b = 0; b < balances.length; b++) {
         const balance = balances[b];
         if (balance?.["COA Num"].toString() == "3991") {
            let runningBalance = balance["Running Balance"] * 100;

            if (fyperstart && balance["FY Period"] == fyperstart)
               runningBalance *= -1;

            balSheetTotal = (balSheetTotal * 100 + runningBalance) / 100;
         }
      }
      data.balSheetTotal = balSheetTotal;
      data.total = {
         en: "Total",
         zh: "总额",
      };
      data.netIncomeLoss = {
         en: "NET INCOME (LOSS)",
         zh: "净收入(损失)",
      };
      data.netIncomeLossBalance = {
         en: "Net Income (loss) from Balance Sheet",
         zh: "Balance Sheet 中的净收入(损失) ",
      };

      return data;
   },
   template: () => {
      return fs.readFileSync(
         path.join(__dirname, "templates", "income-vs-expense.ejs"),
         "utf8"
      );
   },
};
