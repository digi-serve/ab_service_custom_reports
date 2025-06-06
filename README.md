[![GitHub Workflow Status (with event)](https://img.shields.io/github/actions/workflow/status/CruGlobal/ab_service_custom_reports/pr-merge-release.yml?logo=github&label=Build%20%26%20Test)](https://github.com/CruGlobal/ab_service_custom_reports/actions/workflows/pr-merge-release.yml)
[![GitHub tag (with filter)](https://img.shields.io/github/v/tag/CruGlobal/ab_service_custom_reports?logo=github&label=Latest%20Version)
](https://github.com/CruGlobal/ab_service_custom_reports/releases)
[![Docker Pulls](https://img.shields.io/docker/pulls/digiserve/ab-custom-reports?logo=docker&logoColor=white&label=Docker%20Pulls)](https://hub.docker.com/r/digiserve/ab-custom-reports)
[![Image Size](https://img.shields.io/docker/image-size/digiserve/ab-custom-reports/master?logo=docker&logoColor=white&label=Image%20Size)](https://hub.docker.com/r/digiserve/ab-custom-reports/tags)

# AppBuilder Service Custom Reports
An AppBuilder service to generate custom reports.

## Install
See [ab_cli](https://github.com/CruGlobal/ab-cli)

## Pull Requests
Pull Requests should be tagged with a label `major`, `minor` or `patch`. Use `major` for breaking changes, `minor` for new features, or `patch` for bug fixes. To merge without creating a release a `no_release` tag can be added instead.

:pencil: In the pull request body add release notes between these tags:
```md
<!-- #release_notes -->

<!-- /release_notes --> 
```
Anything between those 2 lines will be used as release notes when creating a version.

### When merged:
 - A new version will be created using semantic versioning
 - The version will be updated in `package.json`
 - A new tag and release will be created on GitHub
 - A new docker image will be built, tagged with the version and published to dockerhub
 - A Workflow in `ab_runtime` will be triggered to update the service version file.

## Manually Building a Docker Image
It may be useful to build a custom docker image from a feature branch for testing.
This can be done through a workflow dispatch trigger.
1. Go to the Actions tab
2. Select the 'Docker Build Custom' workflow
3. Select 'run Workflow' and fill in the form
The image will be built from the selected branch and pushed to dockerhub using the given tags

## Adding Reports

Use the appbuilder cli to add a new endpoint:

```bash
appbuilder service new custom_reports
```

The first 3 questions aren't important, but answer Y when asked to create an API endpoint.

```bash
? Create an initial API endpoint for this service? : (y/N)
```

Answer the remaining questions.

After the script finishes you will should see a handler in `/handlers`. In the created file write custom logic within the then function of `ABBootstrap.init()` to load and return html.

```js
ABBootstrap.init(req).then(async (AB) => {
   // Prepare and return html
   ejs.renderFile(templatePath, data, {}, (err, html) => {
      if (err) {
         cb(err);
      } else {
         cb(null, html);
      }
   });
});
```

Store your ejs template in `/templates`.

You will also need to edit the controller added in `api_sails/api/controllers/custom_reports` to pass on the retuned html.

```js
req.ab.serviceRequest("custom_reports.report", jobData, (err, results) => {
   if (err) {
      res.ab.error(err);
      return;
   }
   // Add this:
   res.status("200");
   res.send(results);
});
```

## How do I see my edits?

in root directory run this
`./restart.sh custom_reports`
To debug:
Add this code to the override or docker-compose

```
  custom_reports:
    ports:
      - "9229:9229"
```
If it isn't found, try port forwarding in chrome://inspect
### Other notes:

July/2022
It seems that this service will just not start up if there are any problems with the sub-reports.

report/well-invoice?payeeId=2
http://127.0.0.1:8088/report/income-vs-expense?fyper=FY22%20M12
http://127.0.0.1:8088/report/local-income-expense?rc=RC%20Center%20flush&fiscalPeriod=FY22%20M12
http://127.0.0.1:8088/report/balance-sheet?rc=RC%20Center%20flush&month=FY22%20M12

In order to test: Make sure that the objects exist on your local, otherwise `AB.objectByID().object()` will throw an exception
### How do I enable custom reports?

Add this to your root /config/local.js and run configReset.sh:

```custom_reports: {
   enable: true,
},
```