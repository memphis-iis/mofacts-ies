////////////////////////////////////////////////////////////////////////////
// Template storage and helpers

Template.profile.helpers({
    username: function () {
        if (!haveMeteorUser()) {
            routeToSignin();
        }
        else {
            return Meteor.user().username;
        }
    },

    simulationChecked: function() {
        return Session.get("runSimulation");
    },

    speechAPIKeyIsSetup: function(){
      return Session.get("speechAPIKeyIsSetup");
    }
});

////////////////////////////////////////////////////////////////////////////
// Template Events

Template.profile.events({
    'click .logoutLink' : function (event) {
        event.preventDefault();
        Meteor.logout( function (error) {
            if (typeof error !== "undefined") {
                //something happened during logout
                console.log("User:", Meteor.user(), "Error:", error);
            }
            else {
                routeToSignin();
            }
        });
    },

    'click .homeLink' : function (event) {
        event.preventDefault();
        Router.go("/profile");
    },

    'click .allItemsLink' : function (event) {
        event.preventDefault();
        Router.go("/allItems");
    },

    'click .allStudentsLink' : function (event) {
        event.preventDefault();
        Router.go("/allStudents");
    },


    'click .adminLink' : function (event) {
        event.preventDefault();
        Router.go("/admin");
    },

    // Start a TDF
    'click .stimButton' : function (event) {
        event.preventDefault();
        console.log(event);

        var target = $(event.currentTarget);
        selectTdf(
            target.data("tdfkey"),
            target.data("lessonname"),
            target.data("stimulusfile"),
            target.data("tdffilename"),
            target.data("ignoreOutOfGrammarResponses"),
            target.data("enableAudioPromptAndFeedback"),
            target.data("speechOutOfGrammarFeedback"),
            "User button click"
        );
    },

    'click #simulation': function(event, template) {
        var checked = template.$("#simulation").prop('checked');
        Session.set("runSimulation", checked);
        console.log("runSimulation", Session.get("runSimulation"));
    },

    'click #setupAPIKey' : function(e){
      e.preventDefault();
      $('#speechAPIModal').modal('show');//{backdrop: "static"}
      Meteor.call('getUserSpeechAPIKey', function(error,key){
        $('#speechAPIKey').val(key);
      });
    },

    'click #speechAPISubmit' : function(e){
      var key = $('#speechAPIKey').val();
      Meteor.call("saveUserSpeechAPIKey", key, function(error, serverReturn) {
          //Make sure to update our reactive session variable so the api key is
          //setup indicator updates
          checkAndSetSpeechAPIKeyIsSetup();

          $('#speechAPIModal').modal('hide');

          if (!!error) {
              console.log("Error saving speech api key", error);
              alert("Your changes were not saved! " + error);
          }
          else {
              console.log("Profile saved:", serverReturn);
              //Clear any controls that shouldn't be kept around
              $(".clearOnSave").val("");
              alert("Your profile changes have been saved");
          }
      });
    },

    'click #speechAPIDelete' : function(e){
      Meteor.call("deleteUserSpeechAPIKey",function(error){
        //Make sure to update our reactive session variable so the api key is
        //setup indicator updates
        checkAndSetSpeechAPIKeyIsSetup();
        $('#speechAPIModal').modal('hide');
        if(!!error){
          console.log("Error deleting speech api key", error);
          alert("Your changes were not saved! " + error);
        }else{
          console.log("User speech api key deleted");
          alert("Your profile changes have been saved");
        }
      })
    }
});

Template.profile.rendered = function () {
    $('#speechAPIModal').on('shown.bs.modal', function () {
      $('#speechAPIKey').focus();
    })

    checkAndSetSpeechAPIKeyIsSetup();

    //Set up input sensitivity range to display/hide when audio input is enabled/disabled
    var audioToggle = document.getElementById('audioToggle');

    var showHideAudioEnabledGroup = function()
    {
      if(audioToggle.checked){
          $('.audioEnabledGroup').removeClass('invisible');
          $('.audioEnabledGroup').addClass('flow');
      }else{
        $('.audioEnabledGroup').addClass('invisible');
        $('.audioEnabledGroup').removeClass('flow');
      }
    };
    $('#audioToggle').change(showHideAudioEnabledGroup);
    //Restore toggle state
    audioToggle.checked = Session.get("audioToggled");
    showHideAudioEnabledGroup();

    //this is called whenever the template is rendered.
    var allTdfs = Tdfs.find({});

    $("#expDataDownloadContainer").html("");

    var addButton = function(btnObj) {
        $("#testButtonContainer").append(
            $("<div class='col-xs-12 col-sm-12 col-md-3 col-lg-3 text-center'><br></div>").prepend(
                btnObj
            )
        );
    };

    //In experiment mode, they may be forced to a single tdf
    var experimentTarget = null;
    if (Session.get("loginMode") === "experiment") {
        experimentTarget = Session.get("experimentTarget");
        if (experimentTarget)
            experimentTarget = experimentTarget.toLowerCase();
    }

    //Will be populated if we find an experimental target to jump to
    var foundExpTarget = null;

    var isAdmin = Roles.userIsInRole(Meteor.user(), ["admin"]);

    //Check all the valid TDF's
    allTdfs.forEach( function (tdfObject) {
        //Make sure we have a valid TDF (with a setspec)
        var setspec = _.chain(tdfObject)
            .prop("tdfs")
            .prop("tutor")
            .prop("setspec").first()
            .value();

        if (!setspec) {
            console.log("Invalid TDF - it will never work", tdfObject);
            return;
        }

        var name = _.chain(setspec).prop("lessonname").first().value();
        if (!name) {
            console.log("Skipping TDF with no name", setspec);
            return;
        }

        var stimulusFile = _.chain(setspec).prop("stimulusfile").first().value();

        var ignoreOutOfGrammarResponses = _.chain(setspec).prop("speechIgnoreOutOfGrammarResponses").first().value();
        if(!ignoreOutOfGrammarResponses){
          ignoreOutOfGrammarResponses = false;
        }

        var enableAudioPromptAndFeedback = _.chain(setspec).prop("enableAudioPromptAndFeedback").first().value();
        if(!enableAudioPromptAndFeedback){
          enableAudioPromptAndFeedback = false;
        }

        var speechOutOfGrammarFeedback = _.chain(setspec).prop("speechOutOfGrammarFeedback").first().value();
        if(!speechOutOfGrammarFeedback){
          speechOutOfGrammarFeedback = "Response not in answer set"
        }

        //Check to see if we have found a selected experiment target
        if (experimentTarget && !foundExpTarget) {
            var tdfExperimentTarget = _.chain(setspec)
                .prop("experimentTarget").first().trim()
                .value().toLowerCase();

            if (tdfExperimentTarget && experimentTarget == tdfExperimentTarget) {
                foundExpTarget = {
                    tdfkey: tdfObject._id,
                    lessonName: name,
                    stimulusfile: stimulusFile,
                    tdffilename: tdfObject.fileName,
                    ignoreOutOfGrammarResponses: ignoreOutOfGrammarResponses,
                    enableAudioPromptAndFeedback: enableAudioPromptAndFeedback,
                    speechOutOfGrammarFeedback: speechOutOfGrammarFeedback,
                    how: "Auto-selected by experiment target " + experimentTarget
                };
            }
        }

        // Show data download - note that this happens regardless of userselect
        if (Meteor.userId() === tdfObject.owner || isAdmin) {
            var disp = name;
            if (tdfObject.fileName != name) {
                disp += " (" + tdfObject.fileName + ")";
            }

            $("#expDataDownloadContainer").append(
                $("<div></div>").append(
                    $("<a class='exp-data-link' target='_blank'></a>")
                        .attr("href", "/experiment-data/" + tdfObject.fileName +"/datashop")
                        .text("Download: " + disp)
                )
            );
        }

        //Note that we defer checking for userselect in case something above
        //(e.g. experimentTarget) auto-selects the TDF
        var userselectText = _.chain(setspec)
            .prop("userselect").first().trim()
            .value().toLowerCase();

        var userselect = true;
        if (userselectText === "false")
            userselect = false;

        if (!userselect) {
            console.log("Skipping due to userselect=false for ", name);
            return;
        }

        addButton(
            $("<button type='button' id='"+tdfObject._id+"' name='"+name+"'></button>")
                .addClass("btn btn-block btn-responsive stimButton")
                .data("lessonname", name)
                .data("stimulusfile", stimulusFile)
                .data("tdfkey", tdfObject._id)
                .data("tdffilename", tdfObject.fileName)
                .data("ignoreOutOfGrammarResponses",ignoreOutOfGrammarResponses)
                .data("enableAudioPromptAndFeedback",enableAudioPromptAndFeedback)
                .data("speechOutOfGrammarFeedback",speechOutOfGrammarFeedback)
                .html(name)
        );
    });

    //Did we find something to auto-jump to?
    if (foundExpTarget) {
        selectTdf(
            foundExpTarget.tdfkey,
            foundExpTarget.lessonName,
            foundExpTarget.stimulusfile,
            foundExpTarget.tdffilename,
            foundExpTarget.ignoreOutOfGrammarResponses,
            foundExpTarget.enableAudioPromptAndFeedback,
            foundExpTarget.speechOutOfGrammarFeedback,
            foundExpTarget.how
        );
    }
};

//Actual logic for selecting and starting a TDF
function selectTdf(tdfkey, lessonName, stimulusfile, tdffilename, ignoreOutOfGrammarResponses, enableAudioPromptAndFeedback,speechOutOfGrammarFeedback,how) {
    console.log("Starting Lesson", lessonName, tdffilename, "Stim:", stimulusfile);

    //make sure session variables are cleared from previous tests
    sessionCleanUp();

    //Set the session variables we know
    //Note that we assume the root and current TDF names are the same.
    //The resume logic in the the card template will determine if the
    //current TDF should be changed due to an experimental condition
    Session.set("currentRootTdfName", tdffilename);
    Session.set("currentTdfName", tdffilename);
    Session.set("currentStimName", stimulusfile);
    Session.set("ignoreOutOfGrammarResponses",ignoreOutOfGrammarResponses);
    Session.set("enableAudioPromptAndFeedback",enableAudioPromptAndFeedback);
    Session.set("speechOutOfGrammarFeedback",speechOutOfGrammarFeedback);

    //Get some basic info about the current user's environment
    var userAgent = "[Could not read user agent string]";
    var prefLang = "[N/A]";
    try {
        userAgent = _.display(navigator.userAgent);
        prefLang = _.display(navigator.language);
    }
    catch(err) {
        console.log("Error getting browser info", err);
    }

    //Save the test selection event
    recordUserTime("profile tdf selection", {
        target: lessonName,
        tdfkey: tdfkey,
        tdffilename: tdffilename,
        stimulusfile: stimulusfile,
        userAgent: userAgent,
        browserLanguage: prefLang,
        selectedHow: how
    });

   var audioEnabled =
      getCurrentTdfFile().tdfs.tutor.setspec[0].audioInputEnabled ||
      document.getElementById('audioToggle').checked;
   //Record state to restore when we return to this page
   Session.set("audioToggled",document.getElementById('audioToggle').checked);
   Session.set("audioEnabled", audioEnabled);

   //If user has enabled audio input, set up some session variables for use by
   //card.js to tailor input experience
   if(Session.get("audioEnabled"))
   {
     var audioInputSensitivity =
      getCurrentTdfFile().tdfs.tutor.setspec[0].audioInputSensitivity ||
      document.getElementById("audioInputSensitivity").value;
     Session.set("audioInputSensitivity",audioInputSensitivity);
     //Check if the user has a speech api key defined, if not show the modal form
     //for them to input one.  If so, actually continue initializing web audio
     //and going to the practice set
     Meteor.call('getUserSpeechAPIKey', function(error,key){
       speechAPIKey = key;
       if(!speechAPIKey && !getCurrentTdfFile().tdfs.tutor.setspec[0].speechAPIKey)
       {
         console.log("speech api key not found, showing modal for user to input");
         $('#speechAPIModal').modal('show');
       }else {
         console.log("audio toggle checked and key present, navigating to card and initializing audio input");
         //Go directly to the card session - which will decide whether or
         //not to show instruction
         Session.set("needResume", true);
         Router.go("/card");
       }
     });
   }else {
     console.log("audio toggle not checked");
     //Go directly to the card session - which will decide whether or
     //not to show instruction
     Session.set("needResume", true);
     Router.go("/card");
   }
}

//We'll use this in card.js if audio input is enabled and user has provided a
//speech API key
speechAPIKey = null;

checkAndSetSpeechAPIKeyIsSetup = function(){
  Meteor.call('isUserSpeechAPIKeySetup', function(err,data){
    if(err){
      console.log("Error getting whether speech api key is setup");
    }else {
      Session.set('speechAPIKeyIsSetup',data);
    }
  })
}
