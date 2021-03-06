/* router.js - the routing logic we use for the application.

If you need to create a new route, note that you should specify a name and an
action (at a minimum). This is good practice, but it also works around a bug
in Chrome with certain versions of Iron Router (they routing engine we use).

IMPORTANT: If you are routing someone to the signin screen (i.e. they need to
log in) then you should call the routeToSignin function of calling Router.go
directly. This is important to make sure that both "normal" logins *and*
experimental participant (Mechanical Turk) logins function correctly.

The routes are self-explanatory, but "loginMode" requires a little explanation.
When a user enters the application via a URL of the form /experiment/{target}/{x}
they are placed in "experiment" mode. The following changes are made:

    * The session var "loginMode" is set to "experiment" (instead of "normal")
    * The session var "experimentTarget" is set to whatever is specified in
      {target} in the URL. This is required.
    * The session var "experimentXCond" is set to whatever is specified in {x}
      in the URL. This defaults to 0. The default value is used if the value
      given cannot be interpreted as an int.
    * The user is NOT shown the OAuth "Sign In With Google" screen. Instead a
      screen for user ID entry (which should be their Turk ID) is shown instead
    * The user isn't allowed to select a TDF - the TDF matching {target} is
      always chosen. (This is specified in the <experimentTarget> tag in the
      top TDF setspec section).

As an example, if a user navigates to
    https://mofacts.optimallearning.org/experiment/learning/1
then the following things will happen:

    * Session["loginMode"] == "experiment"
    * Session["experimentTarget"] == "learning"
    * Session["experimentXCond"] == "1"
    * The user is asked for an ID
    * After entering the ID, the user is taken to the TDF with
      <experimentTarget>learning</experimentTarget> in it's setspec

As an example of XCond defaults, the following URL's are ALL equivalent:

    * https://mofacts.optimallearning.org/experiment/learning/
    * https://mofacts.optimallearning.org/experiment/learning/0
    * https://mofacts.optimallearning.org/experiment/learning/abc

A major issue is that once a user enters in experiment mode, the routes (like
instructions and card) look the same. If the user uses the browser's refresh
function, our logic will take them to the "normal" sign in screen. Since we
allow login via Gmail account this could be confusing. As a result, we now use
a cookie scheme to insure experimental participants stay in experiment mode:

    * When a user first hits the URL /experiment/{target}/{x} we write cookies
      (with expiration set so that they outlast the current browser session)
    * Whenever routeToSignin is called, we check the cookies. If they are set
      then we reconstruct the experiment session variables as above.
    * If a user visits the root ("/") route, we reset all cookies back in order
      to allow "normal" login again.
*/

// Note that these three session variables aren't touched by the helpers in
// lib/sessionUtils.js. They are only set here in our client-side routing
Session.set("loginMode", "normal");
Session.set("experimentTarget", "");
Session.set("experimentXCond", "");
Session.set("clusterMapping", "");


routeToSignin = function() {
    console.log("routeToSignin");
    // If the isExperiment cookie is set we always for experiment mode. This
    // handles an experimental participant refreshing the browser
    var expCookie = _.chain(Cookie.get("isExperiment")).trim().intval().value();
    if (expCookie) {
        Session.set("loginMode", "experiment");
        Session.set("experimentTarget", Cookie.get("experimentTarget"));
        Session.set("experimentXCond", Cookie.get("experimentXCond"));
    }

    var loginMode = Session.get("loginMode");
    console.log("loginMode: " + loginMode);

    if (loginMode === "experiment") {
        console.log("loginMode === experiment");
        var routeParts = ['/experiment'];

        var target = Session.get("experimentTarget");
        if (target) {
            routeParts.push(target);
            var xcond = Session.get("experimentXCond");
            if (xcond) {
                routeParts.push(xcond);
            }
        }

        Router.go(routeParts.join('/'));
    }else if(loginMode === "southwest"){
      console.log("southwest login, routing to southwest login");
      Router.go("/signInSouthwest");
    }else if(loginMode === "password"){
      console.log("password login");
      Router.go("/signIn");
    }else{ //Normal login mode
      console.log("else, signin");
      Router.go("/");
    }
};

Router.route('/experiment/:target?/:xcond?', {
    name: "client.experiment",
    action: function() {
        Session.set("curModule","experiment");
        // We set our session variable and also set a cookie (so that we still
        // know they're an experimental participant after browser refresh)
        var target = this.params.target || "";
        var xcond = this.params.xcond || "";

        Session.set("loginMode", "experiment");
        Session.set("experimentTarget", target);
        Session.set("experimentXCond", xcond);

        Cookie.set("isExperiment", "1", 21);  // 21 days
        Cookie.set("experimentTarget", target, 21);
        Cookie.set("experimentXCond", xcond, 21);

        Session.set("experimentPasswordRequired",false);
        Session.set("clusterMapping", "");
        console.log("EXPERIMENT target:", target, "xcond", xcond);
        this.render('signIn');
    }
});

const defaultBehaviorRoutes = [
  'signIn',
  'signInSouthwest',
  'signUp',
  'profileSouthwest',
  'multiTdfSelect',
  'turkWorkflow',
  'contentUpload',
  'dataDownload',
  'userProfileEdit',
  'userAdmin',
  'contentGeneration',
  'classEdit',
  'tdfAssignmentEdit',
  'instructorReporting',
  'studentReporting',
  'voice' //Voice interstitial to delay the user until voice input can recognize voice start and voice stop with VAD.js
];

var getDefaultRouteAction = function(routeName){
  return function(){
    Session.set("curModule",routeName.toLowerCase());
    console.log(routeName + " ROUTE");
    this.render(routeName);
  }
}

//set up all routes with default behavior
for(let route of defaultBehaviorRoutes){
  Router.route('/' + route,{
    name: "client." + route,
    action: getDefaultRouteAction(route)
  });
}

Router.route('/', {
    name: "client.index",
    action: function () {
        Session.set("curModule","signinoauth");
        this.render('signInOauth');
    }
});

Router.route('/profile', {
    name: "client.profile",
    action: function () {
        if(Meteor.user()){
          if (Roles.userIsInRole(Meteor.user(), ["admin"])) {
              this.subscribe('allUsers').wait();
          }
          var loginMode = Session.get("loginMode");
          console.log("loginMode: " + loginMode);

          if(loginMode === "southwest"){
            console.log("southwest login, routing to southwest profile");
            Session.set("curModule","profileSouthwest");
            this.render("/profileSouthwest");
          }else{ //Normal login mode
            console.log("else, progress");
            Session.set("curModule","profile");
            this.render('profile');
          }
        }else{
          this.redirect('/');
        }
    }
});

Router.route('/card', {
    name: "client.card",
    action: function () {
      if(Meteor.user()){
        Session.set("curModule","card");
        this.render('card');
      }else{
        this.redirect('/');
      }
    }
});

// We track the start time for instructions, which means we need to track
// them here at the instruction route level
Session.set("instructionClientStart", 0);
Router.route('/instructions', {
    name: "client.instructions",
    action: function () {
        Session.set("instructionClientStart", Date.now());
        Session.set("curModule","instructions");
        this.render('instructions');
    },
    onAfterAction: function() {
        // If we've routed to the instructions but there's nothing to do then
        // it's time to move on. We do NOT do this in onBeforeAction because
        // we have instruction logic that needs to have handled and Iron Router
        // doesn't like us setting up async re-routes.
        if (!haveMeteorUser()) {
            console.log("No one logged in - allowing template to handle");
        }
        else {
            var unit = getCurrentTdfUnit();
            var txt = _.chain(unit).prop("unitinstructions").first().trim().value();
            var pic = _.chain(unit).prop("picture").first().trim().value();
            if (!txt && !pic) {
                console.log("Instructions empty: skipping", displayify(unit));
                instructContinue();
            }
        }
    },
});