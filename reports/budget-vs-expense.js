/**
 *Budget VS Expense Report
 *
 *
 */
const fs = require("fs");
const path = require("path");
const utils = require("./_utils");

const OBJECT_IDS = {
   FiscalYear: "6c398e8f-ddde-4e26-b142-353de5b16397",
   ProjectBudget: "839ac470-8f77-420c-9a30-aeaf0a9f509c",
};

const QUERY_IDS = {
   myTeams: "62a0c464-1e67-4cfb-9592-a7c5ed9db45c",
   myRCs: "241a977c-7748-420d-9dcb-eff53e66a43f",
   teamJEArchive: "1bcd1217-7116-4e83-b6d1-da81b36a38cb",
};

const FIELD_IDS = {
   BUDGET_RC: "9bd86c7d-102d-4aa5-ae45-a7bcc19e7192",
   BUDGET_TEAM: "d35ba507-3f93-4eca-8046-b16ea85a2433",
   BUDGET_YEAR: "0053696c-b597-4871-a40b-8360ac63d2b6",

   EXPENSE_TEAM: "f8ee19c3-554c-4354-8cff-63310a1d9ae0",
   EXPENSE_RC: "232d33bd-40e9-4ba6-8718-9718cbc95f5b",
   EXPENSE_YEAR: "549ab4ac-f436-461d-9777-505d6dc1d4f7",
   EXPENSE_ACCOUNT: "69133f41-7c12-44af-bd59-426a723f5e1e",

   PROJECT_NUMBER: "3bb80108-b29b-4141-a84e-646bcbab98bf",
   PROJECT_NAME: "3adf1639-fbaf-44f9-9249-d2800506642c",

   myRCsTeam: "ae4ace97-f70c-4132-8fa0-1a0b1a9c7859",
};

const FilterOutRC = [
   "06 : Q100-QX MT",
   "02 : Q5CD-South Campus MT",
   "02 : Q5CD-North Campus MT",
   "02 : Q3SY-XSM city cross MT",
   "02 : Q3SY-SSN non-cross MT",
   "02 : Q3SY-SIE non-cross MT",
   "02 : Q3SY-SAU non-cross MT",
   "02 : Q3SY-DDU non-cross MT",
   "02 : Q3NM-HNM non-cross MT",
   "02 : Q3NM-HNM cross MT",
   "02 : Q3HB-HEB non-cross MT",
   "02 : Q3HB-HEB cross MT",
   "02 : Q3DL-DDL non-cross MT",
   "02 : Q3DL-DDL cross MT",
   "02 : Q3CC-CC non-cross MT",
   "02 : Q3CC-CC cross MT",
   "02 : Q1BJ-Domestic MT",
   "02 : Q1BJ-2016CP XJ MT",
   "02 : Q1BJ-2013SC MT-KuangDa",
   "02 : Q1BJ-2013Bangladesh MT",
];

function sort(a, b) {
   return (a ?? "").toLowerCase().localeCompare((b ?? "").toLowerCase());
}

async function getProjectBudgets(modelProjectBudget, team, rc, year) {
   if (!team) return [];

   const condProject = {
      glue: "and",
      rules: [
         {
            key: FIELD_IDS.BUDGET_TEAM,
            rule: "equals",
            value: team,
         },
         {
            key: FIELD_IDS.BUDGET_RC,
            rule: "not_in",
            value: FilterOutRC,
         }
      ],
   };

   if (rc) {
      condProject.rules.push({
         key: FIELD_IDS.BUDGET_RC,
         rule: "equals",
         value: rc,
      });
   }
   if (year) {
      condProject.rules.push({
         key: FIELD_IDS.BUDGET_YEAR,
         rule: "equals",
         value: year,
      });
   }

   return await modelProjectBudget.findAll({
      where: condProject,
      sort: [
         { key: FIELD_IDS.BUDGET_RC, dir: "ASC" },
         { key: FIELD_IDS.PROJECT_NUMBER, dir: "ASC" }
      ],
      populate: false,
   });
}

async function getActualExpense(modelTeamJEArchive, team, rc, year) {
   if (!team) return [];

   const cond = {
      glue: "and",
      rules: [
         {
            key: FIELD_IDS.EXPENSE_TEAM,
            rule: "equals",
            value: team,
         },
         {
            key: FIELD_IDS.EXPENSE_RC,
            rule: "not_in",
            value: FilterOutRC,
         },
         {
            key: FIELD_IDS.EXPENSE_YEAR,
            rule: "contains",
            value: year,
         },
         {
            // Start with COA Num 7xxx,8xxx
            glue: "or",
            rules: [
               {
                  key: FIELD_IDS.EXPENSE_ACCOUNT,
                  rule: "begins_with",
                  value: "7",
               },
               {
                  key: FIELD_IDS.EXPENSE_ACCOUNT,
                  rule: "begins_with",
                  value: "8",
               },
            ],
         }
      ],
   };

   if (rc) {
      cond.rules.push({
         key: FIELD_IDS.EXPENSE_RC,
         rule: "equals",
         value: rc,
      });
   }

   return await modelTeamJEArchive.findAll({
      where: cond,
      sort: [
         { key: FIELD_IDS.EXPENSE_RC, dir: "ASC" },
         { key: FIELD_IDS.PROJECT_NUMBER, dir: "ASC" },
      ],
      populate: false,
   });
}

module.exports = {
   prepareData: async (AB, { team, rc, fyYear }, req) => {
      const data = {
         current_path: __dirname,
         title: {
            en: "Budget vs. Actual",
            zh: "预算 VS 实际的",
         },
         fnValueFormat: utils.valueFormat,
      };
      // get our passed params
      data.team = team ? team : undefined;
      data.rc = rc ? rc : undefined;
      data.fyYear = fyYear;
      fyYear = fyYear || `FY${new Date().getFullYear().toString().slice(-2)}`;

      const myTeams = AB.queryByID(QUERY_IDS.myTeams).model();
      const myRCs = AB.queryByID(QUERY_IDS.myRCs).model();
      const queryTeamJEArchive = AB.queryByID(QUERY_IDS.teamJEArchive);
      const modelTeamJEArchive = queryTeamJEArchive.model();
      const yearObj = AB.objectByID(OBJECT_IDS.FiscalYear).model();
      const projectBudgetObj = AB.objectByID(OBJECT_IDS.ProjectBudget).model();

      // Load Data
      const [teamsArray, rcs, yearArray, budgets, expenses] = await Promise.all([
         // Return teams
         myTeams.findAll(
            {
               populate: false,
            },
            { username: req._user.username },
            AB.req
         ),
         // Return myRCs
         myRCs.findAll(
            {
               where: {
                  glue: "and",
                  rules: team
                     ? [
                        {
                           key: FIELD_IDS.myRCsTeam,
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
         //Return year
         yearObj.findAll(
            {
               populate: false,
            },
            { username: req._user.username },
            AB.req
         ),
         getProjectBudgets(projectBudgetObj, team, rc, fyYear),
         getActualExpense(modelTeamJEArchive, team, rc, fyYear),
      ]);

      data.teamOptions = (teamsArray ?? [])
         .map((t) => t["BASE_OBJECT.Name"])
         // Remove duplicated Team
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

      data.totalBudgetAmount = 0;
      data.totalActualExpense = 0;

      // [Format]
      // {
      //    RC_Name: {
      //       project_number: {
      //          project_name: "",
      //          budget_amount: 0,
      //          actual_expense: 0,
      //       },
      //       total_budget_amount: 0,
      //       total_actual_expense: 0,
      //    },
      //    ...
      //    RC_Name_n: {}
      // }
      data.rc_infos = {};

      // Pull BUDGET of each Project
      budgets.forEach((b) => {
         const RC = b["RC"];
         const Project_Number = b["Project Number"];
         const Project_Name = b["Project Name"];
         const Income_Amount = b["Income Total Amount"];

         data.rc_infos[RC] = data.rc_infos[RC] ?? {
            total_budget_amount: 0,
            total_actual_expense: 0,
         };

         data.rc_infos[RC][Project_Number] = data.rc_infos[RC][Project_Number] ?? {
            project_name: Project_Name,
            budget_amount: 0,
            actual_expense: 0,
         };

         data.rc_infos[RC][Project_Number].budget_amount += Income_Amount;
         data.rc_infos[RC].total_budget_amount += Income_Amount;
         data.totalBudgetAmount += Income_Amount;
      });

      // Pull EXPENSE of each Project
      const fieldRC = queryTeamJEArchive.fieldByID(FIELD_IDS.EXPENSE_RC);
      const fieldProjectNumber = queryTeamJEArchive.fieldByID(FIELD_IDS.PROJECT_NUMBER);
      const fieldProjectName = queryTeamJEArchive.fieldByID(FIELD_IDS.PROJECT_NAME);
      expenses.forEach((e) => {
         const RC = e[`${fieldRC.alias}.${fieldRC.columnName}`];
         const Project_Number = e[`${fieldProjectNumber.alias}.${fieldProjectNumber.columnName}`];
         const Project_Name = e[`${fieldProjectName.alias}.${fieldProjectName.columnName}`];
         const ACTUAL_EXPENSE = (e["BASE_OBJECT.Debit"] ?? 0) - (e["BASE_OBJECT.Credit"] ?? 0);

         data.rc_infos[RC] = data.rc_infos[RC] ?? {
            total_budget_amount: 0,
            total_actual_expense: 0,
         };

         data.rc_infos[RC][Project_Number] = data.rc_infos[RC][Project_Number] ?? {
            project_name: Project_Name,
            budget_amount: 0,
            actual_expense: 0,
         };

         data.rc_infos[RC][Project_Number].actual_expense += ACTUAL_EXPENSE;
         data.rc_infos[RC].total_actual_expense += ACTUAL_EXPENSE;
         data.totalActualExpense += ACTUAL_EXPENSE;
      });

      data.percentExpenseBudget = data.totalBudgetAmount && data.totalActualExpense ? data.totalActualExpense/ data.totalBudgetAmount : 0;

      return data;
   },

   template: () => {
      return fs.readFileSync(
         path.join(__dirname, "templates", "budget-vs-expense.ejs"),
         "utf8"
      );
   },
};
