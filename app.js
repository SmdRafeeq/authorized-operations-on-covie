const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const dbPath = path.join(__dirname, "covid19IndiaPortal.db");

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const app = express();
app.use(express.json());

let db = null;

const dbConnection = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("The server started at http://localhost:3000/");
    });
  } catch (error) {
    console.log(`Database error is ${error.message}`);
    process.exit(1);
  }
};

dbConnection();

const convertStateObjToResponseObj = (obj) => {
  return {
    stateId: obj.state_id,
    stateName: obj.state_name,
    population: obj.population,
  };
};

const convertDistrictObjToResponseObj = (obj) => {
  return {
    districtId: obj.district_id,
    districtName: obj.district_name,
    stateId: obj.state_id,
    cases: obj.cases,
    cured: obj.cured,
    active: obj.active,
    deaths: obj.deaths,
  };
};

// AUTHENTICATION API

const authentication = (request, response, next) => {
  let jwtToken;
  const authHeaders = request.headers["authorization"];
  if (authHeaders !== undefined) {
    jwtToken = authHeaders.split(" ")[1];

    if (jwtToken === undefined) {
      response.status(401);
      response.send("Invalid JWT Token");
    } else {
      jwt.verify(jwtToken, "Secret", async (error, payload) => {
        if (error) {
          response.status(401);
          response.send("Invalid JWT Token");
        } else {
          next();
        }
      });
    }
  } else {
    response.status(401);
    response.send("Invalid JWT Token");
  }
};

// 1.  LOGIN API

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `select * from user where username = "${username}";`;
  const dbUser = await db.get(selectUserQuery);

  if (dbUser !== undefined) {
    const passwordCheck = await bcrypt.compare(password, dbUser.password);

    if (passwordCheck === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "Secret");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  } else {
    response.status(400);
    response.send("Invalid user");
  }
});

// 2. GET STATES API

app.get("/states/", authentication, async (request, response) => {
  const selectStatesQuery = `select * from state;`;
  const statesResult = await db.all(selectStatesQuery);

  response.send(
    statesResult.map((eachState) => convertStateObjToResponseObj(eachState))
  );
});

// 3. STATES ID API

app.get("/states/:stateId/", authentication, async (request, response) => {
  const { stateId } = request.params;
  const selectStateQuery = `select * from state where state_id = ${stateId};`;
  const result = await db.get(selectStateQuery);
  response.send(convertStateObjToResponseObj(result));
});

// 4. DISTRICTS API

app.post("/districts/", authentication, async (request, response) => {
  const { stateId, districtName, cases, cured, active, deaths } = request.body;

  const insertDistrictQuery = `insert into district ( state_id, district_name, cases, cured, active, deaths)
                                values (${stateId}, "${districtName}", ${cases}, ${cured}, ${active}, ${deaths});`;
  await db.run(insertDistrictQuery);
  response.send("District Successfully Added");
});

// 5. DISTRICTS ID API

app.get(
  "/districts/:districtId/",
  authentication,
  async (request, response) => {
    const { districtId } = request.params;
    const getDistrictsQuery = `select * from district where district_id = ${districtId};`;

    const result = await db.get(getDistrictsQuery);
    response.send(convertDistrictObjToResponseObj(result));
  }
);

// 6. DISTRICT DELETE API

app.delete(
  "/districts/:districtId/",
  authentication,
  async (request, response) => {
    const { districtId } = request.params;
    const deleteDistrictQuery = `delete from district where district_id = ${districtId};`;
    await db.run(deleteDistrictQuery);
    response.send("District Removed");
  }
);

// 7. UPDATE DISTRICT API

app.put(
  "/districts/:districtId/",
  authentication,
  async (request, response) => {
    const { districtId } = request.params;
    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = request.body;

    const updateQuery = `update district set district_name = "${districtName}",
                        state_id = ${stateId}, cases = ${cases},
                        cured = ${cured}, active = ${active}, deaths = ${deaths}
                        where district_id = ${districtId};`;

    await db.run(updateQuery);
    response.send("District Details Updated");
  }
);

// 8. STATEID STATS

app.get(
  "/states/:stateId/stats/",
  authentication,
  async (request, response) => {
    const { stateId } = request.params;
    const getQuery = `select sum(cases), sum(cured), sum(active),
                        sum(deaths) from district where state_id = ${stateId};`;
    const stats = await db.get(getQuery);
    response.send({
      totalCases: stats["sum(cases)"],
      totalCured: stats["sum(cured)"],
      totalActive: stats["sum(active)"],
      totalDeaths: stats["sum(deaths)"],
    });
  }
);

module.exports = app;
