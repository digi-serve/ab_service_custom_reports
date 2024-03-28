/**
 * teamMonthly
 *
 *
 */
const fs = require("fs");
const path = require("path");
const utils = require("./_utils");

const QUERY_IDS = {
   MY_RCs: "241a977c-7748-420d-9dcb-eff53e66a43f",
};

const OBJECT_IDS = {
   FY_MONTH: "1d63c6ac-011a-4ffd-ae15-97e5e43f2b3f",
   BALANCE: "bb9aaf02-3265-4b8c-9d9a-c0b447c2d804",
   JE_ARCHIVE: "ae1828a8-9aae-40d9-ba16-3dfe9c1b2481",
   RC: "c3aae079-d36d-489f-ae1e-a6289536cb1a",
};

const FIELD_IDS = {
   FY_MONTH_STATUS: "224a0662-ebcb-4469-9d3c-92458a56a069",
   FY_MONTH_END: "49d6fabe-46b1-4306-be61-1b27764c3b1a",
   BALANCE_FYPeriod: "549ab4ac-f436-461d-9777-505d6dc1d4f7",
   BALANCE_RCCode: "7cdadcef-70a1-408a-b4b9-fdbf3c261d2b",
   JE_ARCHIVE_BAL_ID: "1b67bcfb-d9c6-47ce-bb78-8d689e12b3e9",
   JE_ARCHIVE_DATE: "acc290cb-6f5f-4e64-9d88-7ee047462ca7",
   ALL_RC_Team: "ae4ace97-f70c-4132-8fa0-1a0b1a9c7859",
};

const ROLE_IDS = {
   CORE_Finance: "e32dbd38-2300-4aac-84a9-d2c704bd2a29",
}

async function _getRC(AB, req, teams) {
   const isCoreUser = (req._user?.SITE_ROLE ?? []).filter((r) => (r.uuid ?? r) == ROLE_IDS.CORE_Finance).length > 0;
   const teamCond = {
      glue: "or",
      rules: [],
   };

   teams.forEach((team) => {
      if (!team) return;
      teamCond.rules.push({
         key: FIELD_IDS.ALL_RC_Team,
         rule: "equals",
         value: team,
      });
   });

   const allRCs = AB.objectByID(OBJECT_IDS.RC).model();
   const myRCs = AB.queryByID(QUERY_IDS.MY_RCs).model();
   const rcsModel = isCoreUser ? allRCs : myRCs;

   const result = (await rcsModel.findAll(
      {
         where: teamCond,
         populate: false,
      },
      { username: req._user.username },
      AB.req
   ))
      .map((t) => isCoreUser ? t["RC Name"] : t["BASE_OBJECT.RC Name"])
      // Remove duplicated
      .filter(function (t, pos, self) {
         return t && self.indexOf(t) == pos;
      });

   return result;
}

async function getBalances(AB, req, teams, rcs, fyper) {
   if (!fyper) return [];

   const objBalance = AB.objectByID(OBJECT_IDS.BALANCE).model();

   // Define condition rules
   const rules = [];

   // Get RC values
   if (!rcs?.length) {
      rcs = await _getRC(AB, req, teams);
   }

   // Pull Balances with all of my RCs
   if (rcs?.length) {
      rules.push({
         glue: "or",
         rules: rcs.map((rc) => {
            return {
               key: FIELD_IDS.BALANCE_RCCode,
               rule: "equals",
               value: rc,
            };
         }),
      });
   }

   rules.push({
      key: FIELD_IDS.BALANCE_FYPeriod,
      rule: "equals",
      value: fyper,
   });

   // Pull balances
   const results = await objBalance.findAll({
      where: {
         glue: "and",
         rules: rules,
      },
      populate: false,
   }, { username: req._user.username }, req);

   return results;
}

async function getJEarchive(AB, req, teams, rcs, fyper) {
   if (!fyper) return [];

   const objJEarchive = AB.objectByID(OBJECT_IDS.JE_ARCHIVE).model();

   // Define condition rules
   const rules = [];

   // Get RC values
   if (!rcs?.length) {
      rcs = await _getRC(AB, req, teams);
   }

   // Pull JE archive with all of my RCs
   if (rcs?.length) {
      rules.push({
         glue: "or",
         rules: rcs.map((rc) => {
            return {
               key: FIELD_IDS.JE_ARCHIVE_BAL_ID,
               rule: "contains",
               value: `${fyper}%${rc}`,
            }
         })
      });
   }

   // Pull JE archive
   // NOTE: Prevent the performance issue. If no any filter condition, then it should not query data.
   const results = rules?.length ? (await objJEarchive.findAll(
      {
         where: {
            glue: "and",
            rules: rules,
         },
         sort: [
            {
               key: FIELD_IDS.JE_ARCHIVE_DATE,
               dir: "ASC",
            },
         ],
         populate: false,
      },
      { username: req._user.username },
      req
   )) : [];

   return results.map((item) => {
      return {
         balId: item["Bal ID"],
         date: item["Date"],
         description: item["Description"],
         debit: item["Debit"],
         credit: item["Credit"],
      };
   });
}

function calculateRCs(balances) {
   const rcs = {};

   (balances ?? []).forEach((bal) => {
      const COANum = (bal["COA Num"] ?? "").toString();
      const rcName = bal["RC Code"];

      // Init RC object
      rcs[rcName] = rcs[rcName] ?? {
         name: rcName,
         begin: 0,
         income: 0,
         expense: 0,
         transfers: 0,
         end: 0,
      };

      // Beginning Balance = running balance of 3500 + beginning balance of 3991 in this month
      if (COANum == "3500") {
         rcs[rcName].begin += parseFloat(bal["Running Balance"]);
      } else if (COANum == "3991") {
         rcs[rcName].begin += parseFloat(bal["Starting Balance"]);
      }

      // Income = Sum of credit (4xxxx, 5xxx) - Sum of debit (4xxxx, 5xxx)
      else if (COANum.startsWith("4") || COANum.startsWith("5")) {
         rcs[rcName].income +=
            parseFloat(bal["Credit"] ?? 0) - parseFloat(bal["Debit"] ?? 0);
      }

      // Expense = Sum of debit (6xxx, 7xxx, 8xxx) - Sum of credit (6xxx, 7xxx, 8xxx)
      else if (
         COANum.startsWith("6") ||
         COANum.startsWith("7") ||
         COANum.startsWith("8")
      ) {
         rcs[rcName].expense +=
            parseFloat(bal["Debit"] ?? 0) - parseFloat(bal["Credit"] ?? 0);
      }

      // Transfers = 91xx (credit - debit) - 9500 (debit -credit)
      else if (COANum.startsWith("91")) {
         rcs[rcName].transfers +=
            parseFloat(bal["Credit"] ?? 0) - parseFloat(bal["Debit"] ?? 0);
      } else if (COANum == "9500") {
         rcs[rcName].transfers -=
            parseFloat(bal["Debit"] ?? 0) - parseFloat(bal["Credit"] ?? 0);
      }

      // the Ending/Running Balance has been calculated out in the Process of Approval Batch
      if (COANum == "3991") {
         rcs[rcName].end += parseFloat(bal["Running Balance"] ?? 0);
      } else if (COANum == "3500") {
         rcs[rcName].end += parseFloat(bal["Starting Balance"] ?? 0);
      }
   });

   return rcs;
}

function calculateRcDetail(AB, jeArchives, fyper, rcs = {}) {
   const indexOfSpecificPos = (string, subString, pos) => string.split(subString, pos).join(subString).length;

   (jeArchives ?? []).forEach((jeArc) => {
      if (jeArc?.balId == null) return;

      const balId = jeArc.balId.toString();
      if (!balId) return;

      // Get second dash(-) position
      // "FY21 M10-6111-11 : Q4GZ-Donat to forward"
      const dashPos = indexOfSpecificPos(balId, "-", 2) + 1;

      // Pull RC name
      const rc = balId.substring(dashPos).trim();
      if (!rc) return;

      // Init RC detail object
      rcs[rc] = rcs[rc] ?? {};
      rcs[rc].details = rcs[rc].details ?? {
         expenses: [],
         income: [],
         transfers: [],
      };

      // Date format
      jeArc._dateFormat = AB.rules.toDateFormat(jeArc.date, { format: "DD/MM/yyyy" });

      // Expense (6xxx, 7xxx, 8xxx)
      if (
         balId.startsWith(`${fyper}-6`) ||
         balId.startsWith(`${fyper}-7`) ||
         balId.startsWith(`${fyper}-8`)
      ) {
         rcs[rc].details.expenses.push(jeArc);
      }
      // Income (4xxxx, 5xxx)
      else if (
         balId.startsWith(`${fyper}-4`) ||
         balId.startsWith(`${fyper}-5`)
      ) {
         rcs[rc].details.income.push(jeArc);
      }
      // Transfers (91xx, 9500)
      else if (
         balId.startsWith(`${fyper}-91`) ||
         balId.startsWith(`${fyper}-95`)
      ) {
         rcs[rc].details.transfers.push(jeArc);
      }
   });
}

module.exports = {
   // GET: /report/team-monthly
   // Teams, RCs, start, end
   prepareData: async (AB, { Teams, RCs, fyper }, req) => {
      const data = {
         current_path: __dirname,
         title: {
            en: "Team Monthly Report",
            zh: "团队月度收支报告",
         },
         fnValueFormat: utils.valueFormat,
         rcs: {},
      };

      const teamVals = (Teams ?? "").split(",").filter(t => t);
      const rcVals = (RCs ?? "").split(",").filter(rc => rc);

      let balances = [];
      let jeArchives = [];
      [balances, jeArchives] =
         await Promise.all([
            getBalances(AB, req, teamVals, rcVals, fyper),
            getJEarchive(AB, req, teamVals, rcVals, fyper),
         ]);

      data.rcs = calculateRCs(balances);

      // The second part is details of RCs, date, description, amount, which are from JE Archive.
      calculateRcDetail(AB, jeArchives, fyper, data.rcs);

      return data;
   },

   template: () => {
      return fs.readFileSync(
         path.join(__dirname, "templates", "team-monthly.ejs"),
         "utf8"
      );
   },
};
