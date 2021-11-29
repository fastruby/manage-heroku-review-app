const core = require("@actions/core");
const github = require("@actions/github");
const Heroku = require("heroku-client");

async function run() {
  const ctx = github.context;
  core.debug(JSON.stringify(ctx));
  const pr = ctx.payload.pull_request;
  core.debug(JSON.stringify(pr));
  const fork = pr.head.repo.fork;

  if (fork) {
    core.debug("don't allow forks");
  }

  const branch = pr.head.ref;
  const version = ctx.sha;
  const pr_number = pr.number;
  const repo_url = ctx.payload.repository.html_url;
  const source_url = `${repo_url}/tarball/${branch}`;

  core.debug(
    JSON.stringify({
      branch,
      version,
      pr_number,
      repo_url,
      source_url,
    })
  );

  const heroku = new Heroku({ token: process.env.HEROKU_API_TOKEN });

  core.info("Fetching review app list");
  const reviewApps = await heroku.get(
    `/pipelines/${process.env.HEROKU_PIPELINE_ID}/review-apps`
  );

  core.debug(JSON.stringify(reviewApps));

  // Filter to the one for this PR
  const app = reviewApps.find((app) => app.pr_number == pr_number);
  if (app) {
    core.info("Deleting review app");
    await heroku.delete(`/review-apps/${app.id}`);
    core.info("Review app deleted");
  }

  // let requiredCollaboratorPermission = process.env.COLLABORATOR_PERMISSION;
  // if (requiredCollaboratorPermission) {
  //   requiredCollaboratorPermission = requiredCollaboratorPermission.split(
  //     ","
  //   );
  // } else {
  //   requiredCollaboratorPermission = ["triage", "write", "maintain", "admin"];
  // }

  // const perms = await tools.github.repos.getCollaboratorPermissionLevel({
  //   ...tools.context.repo,
  //   username: tools.context.actor,
  // });

  // if (!requiredCollaboratorPermission.includes(perms.data.permission)) {
  //   tools.exit.success("User is not a collaborator. Skipping");
  // }

  // tools.log.info(`User is a collaborator: ${perms.data.permission}`);

  // Otherwise we can complete it in this run
  try {
    core.info("Creating review app");
    await heroku.post("/review-apps", {
      body: {
        branch,
        pipeline: process.env.HEROKU_PIPELINE_ID,
        source_blob: {
          url: source_url,
          version,
        },
        pr_number,
        environment: {
          GIT_REPO_URL: repo_url,
        },
      },
    });
    core.info("Created review app");
  } catch (e) {
    // A 409 is a conflict, which means the app already exists
    if (e.statusCode !== 409) {
      throw e;
    }
    tools.log.complete("Review app is already created");
  }

  tools.log.success("Action complete");
}

run();
