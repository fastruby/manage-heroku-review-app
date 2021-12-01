import * as core from "@actions/core";
import * as github from "@actions/github";
import Heroku from "heroku-client/index";
const HerokuClient = require("heroku-client");

interface ReviewApp {
  pr_number: number;
  id: number;
}

core.debug(JSON.stringify(github.context));

const ctx = github.context;
const pr = ctx.payload.pull_request!;
const fork = pr.head.repo.fork;
const branch = pr.head.ref;
const version = pr.head.sha;
const pr_number = pr.number;
const repo_url = ctx.payload!.repository!.html_url;
const source_url = `${repo_url}/tarball/${branch}`;
const action = core.getInput("action");
const pipeline = process.env.HEROKU_PIPELINE_ID;

async function run() {
  if (fork) {
    core.info("PRs from forked repos can't trigger this action");
    return;
  }

  core.debug("connecting to heroku");
  let heroku: Heroku | undefined;
  try {
    heroku = new HerokuClient({ token: process.env.HEROKU_API_TOKEN });
  } catch (error) {
    core.error(JSON.stringify(error));
  }

  if (!heroku) {
    core.error(
      "Couldn't connect to Heroku, make sure the HEROKU_API_TOKEN is set"
    );
    return;
  }

  switch (action) {
    case "destroy":
      core.info("Fetching review app list");
      try {
        const reviewApps: ReviewApp[] = await heroku.get(
          `/pipelines/${pipeline}/review-apps`
        );

        // Get the Review App for this PR
        const app = reviewApps.find((app) => app.pr_number == pr_number);
        if (app) {
          core.info("Deleting review app");
          await heroku.delete(`/review-apps/${app.id}`);
          core.info("Review app deleted");
        }
      } catch (error) {
        core.error(JSON.stringify(error));
        return;
      }

      break;
    case "create":
      try {
        core.info("Creating review app");
        core.debug(
          JSON.stringify({
            branch,
            pipeline,
            source_blob: {
              url: source_url,
              version,
            },
            pr_number,
          })
        );
        const response = await heroku.post("/review-apps", {
          body: {
            branch,
            pipeline,
            source_blob: {
              url: source_url,
              version,
            },
            pr_number,
          },
        });
        core.debug(response);
        core.info("Created review app");
      } catch (error) {
        core.error(JSON.stringify(error));
      }

      break;
    default:
      core.debug(
        "Invalid action, no action was performed, use one of 'create' or 'destroy'"
      );
      break;
  }

  core.info("Action completed");
}

run();
