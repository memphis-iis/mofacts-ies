/* unitEngine.js
*******************************************************************************
Unit engines handle question/answer selection for a particular unit. This
abstraction let's us treat scheduled-based and module-based units the same in
card.js

A unit engine is "created" by returning an object from a function - note that
this is slightly different from JavaScript prototype object creation, so these
engines aren't created with the "new" keyword.

Also note that the engines may assume that they are added on to the object
from defaultUnitEngine via _.extend

The engine "API"
--------------------------

We provide creation functions for each of the "unit engines" defined here. A
unit engine extends the result of the defaultUnitEngine function call (via the
_.extend function). A unit engine is required to implement:

* field unitType - it should be a string identifying what kind of unit is
supported (note that this will be logged in the UserTimesLog)

* function selectNextCard - when called the engine will select the next card
for display _and_ set the appropriate Session variables. The function should
also return the cluster index identifying the card just selected.

* function cardSelected (accepts selectVal and resumeData) - this function is
called when a card is selected. It will also be called on resume. During "real
time" use the function is called with the return value of selectNextCard (see
above). During resume, seledctVal is set to the the cluster index in the user
log. resumeData is set if and only if resume is happening. It will be the user
log entry - note that this entry should be what was previously returned by
createQuestionLogEntry (see below) plus any additional fields added during the
server-side write.

* function findCurrentCardInfo - when called, then engine should return an
object with the currently selected card's information. See the model unit for
an explicit definition of these fields. Note that the schedule unit just
return an item from the current schedule's q array.

* function createQuestionLogEntry - when called, the engined should return an
object with all fields that should be written to the user log. This is used by
writeQuestionEntry (see below). Also note that this object is what will be in
the resumeData parameter in a call to cardSelected during resume logic (see
above).

* function cardAnswered (accepts wasCorrect and resumeData) - called after the
user provides a response. wasCorrect is a boolean value specifying whether the
user correctly answered or not. resumeData is specified if and only if resume
mode is active (just like cardSelected - see above). Note that this function
_IS_ called for study trials (even though no answer is given) - see the model
unit engine for an example if why this matters.

* function unitFinished - the unit engine should return true if the unit is
completed (nothing more to display)

* function initImpl - OPTIONAL! An engine may implement this function if it
needs special startup logic to be called before it is used.

* function writeQuestionEntry - Should _NOT_ be implemented by the engine.
This function is supplied by the default (base) engine and takes selectVal,
which should be the value returnen by selectNextCard


A note about the session variable "ignoreClusterMapping"
--------------------------------------------------------

Cluster mapping is created and maintained by resume logic in card.js. It is
honored by the utility functions in currentTestingHelpers.js. The mapping is
based on the top-level shuffle/swap-type cluster mapping. Generally this
mapping should be remembered per-user per-experiment after creation and
honored. However, some units (currently just model-based units) actually want
this functionality ignored (although the unit itself can select certain
clusters). As a result, you'll see that our default model sets
ignoreClusterMapping to False before calling the engine's initImpl method. If
you need to turn off ignoreClusterMapping, you MUST do it in the engine's
initImpl method (as we do in modelUnitEngine). We will also set it explicitly
on one-time startup.

******************************************************************************/

// First-time init of ignoreClusterMapping (see above)
Session.set("ignoreClusterMapping", false);

//Helper for our "public" functions
function create(func) {
    var engine = _.extend(defaultUnitEngine(), func());
    engine.init();
    return engine;
}

// Our "public" functions

createEmptyUnit = function() {
    return create(emptyUnitEngine);
};

createModelUnit = function() {
    return create(modelUnitEngine);
};

createScheduleUnit = function() {
    return create(scheduleUnitEngine);
};

// Return an instance of the "base" engine
function defaultUnitEngine() {
    return {
        // Things actual engines must supply
        unitType: "DEFAULT",
        selectNextCard: function() { throw "Missing Implementation"; },
        cardSelected: function(selectVal, resumeData) { throw "Missing Implementation"; },
        createQuestionLogEntry: function() { throw "Missing Implementation"; },
        cardAnswered: function(wasCorrect, resumeData) { throw "Missing Implementation"; },
        unitFinished: function() { throw "Missing Implementation"; },

        // Optional functions that engines can replace if they want
        initImpl: function() { },

        // Functions we supply
        init: function() {
            console.log("Engine created for unit:", this.unitType);
            Session.set("ignoreClusterMapping", false);
            this.initImpl();
            console.log("CLUSTER MAPPING USE (not ignore):", !Session.get("ignoreClusterMapping"));
        },

        writeQuestionEntry: function(selectVal) {
            recordUserTimeQuestion(
                _.extend(
                    { selType: this.unitType, 'selectVal': selectVal },
                    this.createQuestionLogEntry()
                )
            );
        }
    };
}

//////////////////////////////////////////////////////////////////////////////
// Return an instance of a unit with NO question/answer's (instruction-only)
function emptyUnitEngine() {
    return {
        unitType: "instruction-only",

        unitFinished: function() { return true; },

        selectNextCard: function() { },
        findCurrentCardInfo: function() { },
        cardSelected: function(selectVal, resumeData) { },
        createQuestionLogEntry: function() { },
        cardAnswered: function(wasCorrect, resumeData) { }
    };
}

//////////////////////////////////////////////////////////////////////////////
// Return an instance of the model-based unit engine

/* Stats information: we track the following stats in the card info structure.
   (All properties are relative to the object returned by getCardProbs())

- Total stimuli shown to user: numQuestionsIntroduced
- Total responses given by user: numQuestionsAnswered
- Total correct NON-STUDY responses given by user: numCorrectAnswers
- Cluster correct answer count - card.questionSuccessCount
- Cluster incorrect answer count - card.questionFailureCount
- Last time cluster was shown (in milliseconds since the epoch) - card.lastShownTimestamp
- First time cluster was shown (in milliseconds since the epoch) - card.firstShownTimestamp
- Trials since cluster seen - card.trialsSinceLastSeen
- If user has seen cluster - card.hasBeenIntroduced
- Correct answer count for stim (cluster version) - card.stims.stimSuccessCount
- Incorrect answer count for stim (cluster version) - card.stims.stimFailureCount
- If user has seen specific stimulus in a cluster - card.stims.hasBeenIntroduced
- Correct answer count for answer (correct response) text - responses.responseSuccessCount
- Incorrect answer count for answer (correct response) text - responses.responseFailureCount
- Count of times study trials shown per cluster - card.studyTrialCount
- Practice times for the trials per cluster - this ia an ordered list of times,
  each the number of milliseconds in practice - card.practiceTimes
- Total time (in seconds) that other cards have been practiced since a card's
  FIRST practice - card.otherPracticeTimeSinceFirst
- Total time (in seconds) that other cards have been practiced since a card's
  LAST practice - card.otherPracticeTimeSinceLast
*/


function modelUnitEngine() {
    console.log('model unit engine created!!!');
    //Checked against practice seconds. Notice that we capture this on unit
    //creation, so if they leave in the middle of practice and come back to
    //the unit we'll start all over.
    var unitStartTimestamp = Date.now();

    var unitMode = _.chain(getCurrentTdfUnit())
        .prop("learningsession").first()
        .prop("unitMode").trim().value();
        //getCurrentDeliveryParams().unitMode;

    //We cache the stimuli found since it shouldn't change during the unit
    var cachedStimuli = null;
    function fastGetStimCluster(index) {
        if (!cachedStimuli) {
            cachedStimuli = Stimuli.findOne({fileName: getCurrentStimName()});
        }
        return getStimCluster(index, cachedStimuli);
    }

    function getStimParameterArray(clusterIndex,whichParameter){
      return _.chain(fastGetStimCluster(clusterIndex))
            .prop("parameter")
            .prop(_.intval(whichParameter))
            .split(',')
            .map(x => _.floatval(x))
            .value();
    }

    function fastGetStimQuestion(index, whichQuestion) {
        return fastGetStimCluster(index).display[whichQuestion];
    }
    function fastGetStimAnswer(index, whichAnswer) {
        return fastGetStimCluster(index).response[whichAnswer];
    }

    var currentCardInfo = {
        testType: 'd',
        clusterIndex: -1,
        condition: '',
        whichStim : -1,
        forceButtonTrial: false
    };
    function setCurrentCardInfo(clusterIndex, whichStim) {
        currentCardInfo.clusterIndex = clusterIndex;
        currentCardInfo.whichStim = whichStim;
        console.log("MODEL UNIT card selection => ",
            "cluster-idx:", clusterIndex,
            "whichStim:", whichStim,
            "parameter", getStimParameterArray(clusterIndex, whichStim)
        );
    }

    //Initialize card probabilities, with optional initial data
    var cardProbabilities = [];
    function initCardProbs(overrideData) {
        var initVals = {
            numQuestionsAnswered: 0,
            numQuestionsIntroduced: 0,
            numCorrectAnswers: 0,
            cards: []
        };

        if (!!overrideData) {
            initVals = _.extend(initVals, overrideData);
        }
        cardProbabilities = initVals;
    }

    // Initialize cards as we'll need them for the created engine (for current
    // model). Note that we assume TDF/Stimulus is set up and correct - AND
    // that we've already turned off cluster mapping. You'll note that although
    // we nest stims under cards, we maintain a "flat" list of probabilities -
    // this is to speed up calculations and make iteration below easier
    function initializeActRModel() {
        var i, j;

        var numQuestions = getStimClusterCount();
        var initCards = [];
        var initResponses = {};
        var initProbs = [];
        for (i = 0; i < numQuestions; ++i) {
            var card = {
                questionSuccessCount: 0,
                questionFailureCount: 0,
                studyTrialCount: 0,
                trialsSinceLastSeen: 3,  // We start at >2 for initial logic (see findMin/Max functions below)
                lastShownTimestamp: 0,
                firstShownTimestamp: 0,
                hasBeenIntroduced: false,
                canUse: false,
                stims: [],
                practiceTimes: [],
                otherPracticeTimeSinceFirst: 0,
                otherPracticeTimeSinceLast: 0,
                outcomeHistory: [],
                previousCalculatedProbabilities: []
            };

            // We keep per-stim and re-response-text results as well
            var cluster = fastGetStimCluster(i);
            var numStims = _.chain(cluster).prop("display").prop("length").intval().value();
            for (j = 0; j < numStims; ++j) {
                var parameter = getStimParameterArray(i,j); //Note this may be a single element array for older stims or a 3 digit array for newer ones
                // Per-stim counts
                card.stims.push({
                    stimSuccessCount: 0,
                    stimFailureCount: 0,
                    hasBeenIntroduced: false,
                    parameter: parameter,
                    outcomeHistory: [],
                    previousCalculatedProbabilities: []
                });

                initProbs.push({
                    cardIndex: i,
                    stimIndex: j,
                    probability: 0
                });

                // Per-response counts
                var response = Answers.getDisplayAnswerText(cluster.response[j]);
                if (!(response in initResponses)) {
                    initResponses[response] = {
                        responseSuccessCount: 0,
                        responseFailureCount: 0,
                    };
                }
            }

            initCards.push(card);
        }

        // Figure out which cluster numbers that they want
        var unitClusterList = _.chain(getCurrentTdfUnit())
            .prop("learningsession").first()
            .prop("clusterlist").trim().value();

        var clusterList = [];
        Helpers.extractDelimFields(unitClusterList, clusterList);
        for (i = 0; i < clusterList.length; ++i) {
            var nums = Helpers.rangeVal(clusterList[i]);
            for (j = 0; j < nums.length; ++j) {
                initCards[_.intval(nums[j])].canUse = true;
            }
        }

        //Re-init the card probabilities
        initCardProbs({
            cards: initCards,                           // List of cards (each of which has stims)
            responses: initResponses,                   // Dictionary of text responses for
            probs: initProbs,                           // "Flat" list of probabilities
        });

        //has to be done once ahead of time to give valid values for the beginning of the test.
        calculateCardProbabilities();
    }

    // Helpers for time/display/calc below
    function secs(t) {
        return t / 1000.0;
    }
    function elapsed(t) {
        return t < 1 ? 0 : secs(Date.now() - t);
    }

    // This is the final probability calculation used below if one isn't given
    // in the unit's learningsession/calculateProbability tag
    function defaultProbFunction(p) {
        //        p.y = p.stimParameter+
        //        0.866310634* ((0.5 + p.stimSuccessCount)/(1 + p.stimSuccessCount + p.stimFailureCount) - 0.5)+
        //        0.270707611* ((0.5 + p.questionSuccessCount)/(1 + p.questionSuccessCount + p.questionFailureCount) - 0.5)+
        //        0.869477261* ((0.5 + p.responseSuccessCount)/(1 + p.responseSuccessCount + p.responseFailureCount) - 0.5)+
        //        3.642734384* ((0.5 + p.userCorrectResponses)/(1 + p.userTotalResponses) - 0.5)+
        //        3.714113953* (p.recency)+
        //        2.244795778* p.intbs * Math.log(1 + p.stimSuccessCount + p.stimFailureCount) +
        //        0.447943182* p.intbs * Math.log(1 + p.questionStudyTrialCount) +
        //        0.500901271* p.intbs * Math.log(1 + p.responseSuccessCount + p.responseFailureCount);

        // Calculated metrics
        p.baseLevel = 1 / Math.pow(1 + p.questionSecsPracticingOthers + ((p.questionSecsSinceFirstShown - p.questionSecsPracticingOthers) * 0.00785),  0.2514);

        p.meanSpacing = 0;

        if (p.questionStudyTrialCount + p.questionTotalTests == 1) {
            p.meanspacing = 1;
        } else {
            if (p.questionStudyTrialCount + p.questionTotalTests > 1) {
                p.meanSpacing = Math.max(
                        1, Math.pow((p.questionSecsSinceFirstShown - p.questionSecsSinceLastShown) / (p.questionStudyTrialCount + p.questionTotalTests - 1), 0.0294)
                        );
            }
        }

        p.intbs = p.meanSpacing * p.baseLevel;

        p.recency = p.questionSecsSinceLastShown === 0 ? 0 : 1 / Math.pow(1 + p.questionSecsSinceLastShown, 0.2514);

        p.y = p.stimParameter +
        0.55033* Math.log((2+ p.stimSuccessCount)/(2+ p.stimFailureCount))+
        0.88648* Math.log((2 + p.responseSuccessCount)/(2 + p.responseFailureCount))+
        1.00719* Math.log((10 + p.userCorrectResponses)/(10 + p.userTotalResponses-p.userCorrectResponses))+
        3.20689* (p.recency)+
        4.57174* p.intbs * Math.log(1 + p.stimSuccessCount + p.stimFailureCount) +
        0.74734* p.intbs * Math.log(1 + p.responseSuccessCount + p.responseFailureCount);
        p.probability = 1.0 / (1.0 + Math.exp(-p.y));  // Actual probability
        return p;
    }

    // See if they specified a probability function
    var probFunction = _.chain(getCurrentTdfUnit())
        .prop("learningsession").first()
        .prop("calculateProbability").first().trim().value();
    if (!!probFunction) {
        probFunction = new Function("p", "'use strict';\n" + probFunction);  // jshint ignore:line
    }
    else {
        probFunction = defaultProbFunction;
    }


    // Given a single item from the cardProbabilities.probs array, calculate the
    // current probability. IMPORTANT: this function only returns ALL parameters
    // used which include probability. The caller is responsible for storing it.
    function calculateSingleProb(prob) {
        var card = cardProbabilities.cards[prob.cardIndex];
        var stim = card.stims[prob.stimIndex];

        // Possibly useful one day
        // var userTotalTrials = cardProbabilities.numQuestionsIntroduced;
        // var totalPracticeSecs = secs(
        //     _.chain(cards).pluck('practiceTimes').flatten().sum().value()
        // );
        // var questionTrialsSinceLastSeen = card.trialsSinceLastSeen;
        // var questionHasBeenIntroduced = card.hasBeenIntroduced;
        // var questionSecsInPractice = secs(_.sum(card.practiceTimes));
        // var stimHasBeenIntroduced = stim.hasBeenIntroduced;

        // Store parameters in an object for easy logging/debugging
        var p = {};

        // Top-level metrics
        p.userTotalResponses = cardProbabilities.numQuestionsAnswered;
        p.userCorrectResponses = cardProbabilities.numCorrectAnswers;

        // Card/cluster metrics
        p.questionSuccessCount = card.questionSuccessCount;
        p.questionFailureCount = card.questionFailureCount;
        p.questionTotalTests = p.questionSuccessCount + p.questionFailureCount;
        p.questionStudyTrialCount = card.studyTrialCount;
        p.questionSecsSinceLastShown = elapsed(card.lastShownTimestamp);
        p.questionSecsSinceFirstShown = elapsed(card.firstShownTimestamp);
        p.questionSecsPracticingOthers = secs(card.otherPracticeTimeSinceFirst);

        // Stimulus/cluster-version metrics
        p.stimSuccessCount = stim.stimSuccessCount;
        p.stimFailureCount = stim.stimFailureCount;
        p.stimResponseText = Answers.getDisplayAnswerText(fastGetStimAnswer(prob.cardIndex, prob.stimIndex));
        p.resp = cardProbabilities.responses[p.stimResponseText];
        p.responseSuccessCount = p.resp.responseSuccessCount;
        p.responseFailureCount = p.resp.responseFailureCount;
        p.stimParameter = getStimParameterArray(prob.cardIndex,prob.stimIndex)[0];

        p.clusterPreviousCalculatedProbabilities = JSON.parse(JSON.stringify(card.previousCalculatedProbabilities));
        p.clusterOutcomeHistory = card.outcomeHistory;

        p.stimPreviousCalculatedProbabilities = JSON.parse(JSON.stringify(stim.previousCalculatedProbabilities));
        p.stimOutcomeHistory = stim.outcomeHistory;

        p.overallOutcomeHistory = getUserProgress().overallOutcomeHistory;

        console.log("cardIndex: " + prob.cardIndex + ", stimIndex: " + prob.stimIndex);
        console.log("stimResponseText: " + p.stimResponseText);

        console.log("clusterPreviousCalculatedProbabilities: " + JSON.stringify(p.clusterPreviousCalculatedProbabilities));
        console.log("clusterOutcomeHistory: " + JSON.stringify(p.clusterOutcomeHistory));

        console.log("stim.outcomeHistory: " + JSON.stringify(p.stimOutcomeHistory));
        console.log("stimPreviousCalculatedProbabilities: " + JSON.stringify(p.stimPreviousCalculatedProbabilities));

        console.log("overallOutcomeHistory: " + JSON.stringify(p.overallOutcomeHistory));

        // Calculated metrics
         p.baseLevel = 1 / Math.pow(1 + p.questionSecsPracticingOthers + ((p.questionSecsSinceFirstShown - p.questionSecsPracticingOthers) * 0.00785),  0.2514);

        p.meanSpacing = 0;

        if (p.questionStudyTrialCount + p.questionTotalTests == 1) {
            p.meanspacing = 1;
        } else {
            if (p.questionStudyTrialCount + p.questionTotalTests > 1) {
                p.meanSpacing = Math.max(
                        1, Math.pow((p.questionSecsSinceFirstShown - p.questionSecsSinceLastShown) / (p.questionStudyTrialCount + p.questionTotalTests - 1), 0.0294)
                        );
            }
        }

        p.intbs = p.meanSpacing * p.baseLevel;

        p.recency = p.questionSecsSinceLastShown === 0 ? 0 : 1 / Math.pow(1 + p.questionSecsSinceLastShown, 0.2514);

        return probFunction(p);
    }

    // Calculate current card probabilities for every card - see selectNextCard
    // the actual card/stim (cluster/version) selection
    function calculateCardProbabilities() {
        // We use a "flat" probability structure - this is faster than a loop
        // over our nested data structure, but it also gives us more readable
        // code when we're setting something per stimulus
        var probs = cardProbabilities.probs;
        for (var i = 0; i < probs.length; ++i) {
            // card.canUse is true if and only if it is in the clusterlist
            // for the current unit. You could just return here if these clusters
            // should be ignored (or do nothing if they should be included below)
            var parms = calculateSingleProb(probs[i]);
            probs[i].probFunctionsParameters = parms;
            probs[i].probability = parms.probability;
        }
    }

    // Return index of PROB with minimum probability that was last seen at least
    // 2 trials ago. Default to index 0 in case no probs meet this criterion
    function findMinProbCard(cards, probs) {
        var currentMin = 1.00001;
        var indexToReturn = 0;

        for (var i = probs.length - 1; i >= 0; --i) {
            var prob = probs[i];
            var card = cards[prob.cardIndex];

            if (card.canUse && card.trialsSinceLastSeen > 2) {
                if (prob.probability < currentMin) {   // Note that this is stim probability
                    currentMin = prob.probability;
                    indexToReturn = i;
                }
            }
        }

        return indexToReturn;
    }

    //Return index of PROB with max probability that is under ceiling. If no
    //card is found under ceiling then -1 is returned
    function findMaxProbCard(cards, probs, ceiling) {
        var currentMax = 0;
        var indexToReturn = -1;

        for (var i = probs.length - 1; i >= 0; --i) {
            var prob = probs[i];
            var card = cards[prob.cardIndex];

            if (card.canUse && card.trialsSinceLastSeen > 2) {
                // Note that we are checking stim probability
                if (prob.probability > currentMax && prob.probability < ceiling) {
                    currentMax = prob.probability;
                    indexToReturn = i;
                }
            }
        }

        return indexToReturn;
    }

    function findMinProbDistCard(cards,probs){
      var currentMin = 1.00001; //Magic number to indicate greater than highest possible distance to start
      var indexToReturn = 0;

      for (var i = probs.length - 1; i >= 0; --i) {
          var prob = probs[i];
          var card = cards[prob.cardIndex];
          var parameters = card.stims[prob.stimIndex].parameter;
          var optimalProb = parameters[2];
          if(!optimalProb){
            console.log("NO OPTIMAL PROB SPECIFIED IN STIM, DEFAULTING TO 0.90");
            optimalProb = 0.90;
          }
          console.log("!!!parameters: " + JSON.stringify(parameters) + ", optimalProb: " + optimalProb);

          if (card.canUse && card.trialsSinceLastSeen > 2) {
              var dist = Math.abs(prob.probability - optimalProb)
              // Note that we are checking stim probability
              if (dist < currentMin) {
                  currentMin = dist;
                  indexToReturn = i;
              }
          }
      }

      return indexToReturn;
    }

    function findMaxProbCardThresholdCeilingPerCard(cards,probs){
      var currentDistFromThresholdCeiling = 1.00001;
      var indexToReturn = -1;

      var currentDistOverThresholdCeiling = 1.00001;
      var indexToReturnOverThresholdCeiling = 0;

      //TODO: take one closest to own threshold instead of first

      for (var i = probs.length - 1; i >= 0; --i) {
          var prob = probs[i];
          var card = cards[prob.cardIndex];
          var parameters = card.stims[prob.stimIndex].parameter;

          var thresholdCeiling = parameters[1];
          if(!thresholdCeiling){
            console.log("NO THRESHOLD CEILING SPECIFIED IN STIM, DEFAULTING TO 0.90");
            thresholdCeiling = 0.90;
          }
          console.log("!!!parameters: " + JSON.stringify(parameters) + ", thresholdCeiling: " + thresholdCeiling + ", card: " + JSON.stringify(card));

          if (card.canUse && card.trialsSinceLastSeen > 2) {
              var dist = Math.abs(prob.probability - thresholdCeiling);
              // Note that we are checking stim probability
              if (dist < currentDistFromThresholdCeiling && prob.probability < thresholdCeiling) {
                  currentDistFromThresholdCeiling = dist;
                  indexToReturn = i;
              }else if(dist < currentDistOverThresholdCeiling){
                currentDistOverThresholdCeiling = dist;
                indexToReturnOverThresholdCeiling = i;
              }
          }

      }

      if(indexToReturn == -1){
        indexToReturn = indexToReturnOverThresholdCeiling;
      }

      return indexToReturn;
    }

    //Our actual implementation
    return {
        unitType: "model",

        unitMode: (function(){
          var unitMode = _.chain(getCurrentTdfUnit())
              .prop("learningsession").first()
              .prop("unitMode").trim().value();
              //getCurrentDeliveryParams().unitMode;
          console.log("UNIT MODE: " + unitMode);
          return unitMode;
        })(),

        initImpl: function() {
            //We don't want cluster mapping for model-based optmization
            Session.set("ignoreClusterMapping", true);
            initializeActRModel();
        },

        selectNextCard: function() {
            // The cluster (card) index, the cluster version (stim index), and
            // whether or not we should show the overlearning text is determined
            // here. See calculateCardProbabilities for how prob.probability is
            // calculated
            var newProbIndex;
            var showOverlearningText = false;

            var numItemsPracticed = cardProbabilities.numQuestionsAnswered;
            var cards = cardProbabilities.cards;
            var probs = cardProbabilities.probs;

            console.log("!!!cards: " + JSON.stringify(cards));
            console.log("!!!probs: " + JSON.stringify(probs));

            console.log("selectNextCard unitMode: " + this.unitMode);

            switch(this.unitMode){
              case 'thresholdCeiling':
                newProbIndex = findMaxProbCardThresholdCeilingPerCard(cards, probs);
                break;
              case 'distance':
                newProbIndex = findMinProbDistCard(cards,probs);
                break;
              case 'highest':
                newProbIndex = findMaxProbCard(cards, probs, 1.00001); //Magic number to indicate there is no real ceiling (probs should max out at 1.0)
                if (newProbIndex === -1) {
                    newProbIndex = findMinProbCard(cards, probs);
                }
                break;
              default:
                newProbIndex = findMaxProbCard(cards, probs, 0.90);
                if (newProbIndex === -1) {
                    newProbIndex = findMinProbCard(cards, probs);
                }
                break;
            }

            // Found! Update everything and grab a reference to the card and stim
            var prob = probs[newProbIndex];
            var cardIndex = prob.cardIndex;
            var card = cards[cardIndex];
            var whichStim = prob.stimIndex;
            var stim = card.stims[whichStim];

            // Store calculated probability for selected stim/cluster
            var currentStimProbability = prob.probability;
            stim.previousCalculatedProbabilities.push(currentStimProbability);
            card.previousCalculatedProbabilities.push(currentStimProbability);

            // Save the card selection
            // Note that we always take the first stimulus and it's always a drill
            setCurrentClusterIndex(cardIndex);
            Session.set("currentQuestion", fastGetStimQuestion(cardIndex, whichStim));
            var currentQuestion = Session.get("currentQuestion");
            //If we have a dual prompt question populate the spare data field
            if(currentQuestion.indexOf("|") != -1){

              var prompts = currentQuestion.split("|");
              Session.set("currentQuestion",prompts[0]);
              Session.set("currentQuestionPart2",prompts[1]);
              console.log("two part question detected: " + prompts[0] + ",,," + prompts[1]);
            }else{
              console.log("one part question detected");
              Session.set("currentQuestionPart2",undefined);
            }

            Session.set("currentAnswer", fastGetStimAnswer(cardIndex, whichStim));
            Session.set("testType", "d");
            Session.set("questionIndex", 1);  //questionIndex doesn't have any meaning for a model
            Session.set("showOverlearningText", showOverlearningText);

            // About to show a card - record any times necessary
            card.lastShownTimestamp = Date.now();
            if (card.firstShownTimestamp < 1 && card.lastShownTimestamp > 0) {
                card.firstShownTimestamp = card.lastShownTimestamp;
            }

            //Save for returning the info later (since we don't have a schedule)
            setCurrentCardInfo(cardIndex, whichStim);

            // only log this for teachers/admins
            if (Roles.userIsInRole(Meteor.user(), ["admin", "teacher"]) || Meteor.user().username.startsWith('debug')) {
                console.log(">>>BEGIN METRICS>>>>>>>");

                console.log("Overall user stats => ",
                    "total trials:", cardProbabilities.numQuestionsIntroduced,
                    "total responses:", cardProbabilities.numQuestionsAnswered,
                    "total correct responses:", cardProbabilities.numCorrectAnswers
                );

                // Log selections - note that the card output will also include the stim
                console.log("Model selected prob:", displayify(prob));
                console.log("Model selected card:", displayify(card));
                console.log("Model selected stim:", displayify(card.stims[whichStim]));

                // Log time stats in human-readable form
                var secsStr = function(t) { return secs(t) + ' secs'; };
                var elapsedStr = function(t) { return t < 1 ? 'Never Seen': secs(Date.now() - t); };
                console.log(
                    'Card First Seen:', elapsedStr(card.firstShownTimestamp),
                    'Card Last Seen:', elapsedStr(card.lastShownTimestamp),
                    'Total time in practice:', secsStr(_.sum(card.practiceTimes)),
                    'Previous Practice Times:', displayify(_.map(card.practiceTimes, secsStr)),
                    'Total time in other practice:', secs(card.otherPracticeTimeSinceFirst)
                );

                // Display response and current response stats
                var responseText = Answers.getDisplayAnswerText(fastGetStimCluster(cardIndex).response[whichStim]);
                console.log("Response is", responseText, displayify(cardProbabilities.responses[responseText]));

                console.log("<<<END   METRICS<<<<<<<");
            }

            return newProbIndex; //Must return index for call to cardSelected
        },

        findCurrentCardInfo: function() {
            return currentCardInfo;
        },

        cardSelected: function(selectVal, resumeData) {
            // Find objects we'll be touching
            var probIndex = _.intval(selectVal);  // See selectNextCard

            var prob = cardProbabilities.probs[probIndex];
            var indexForNewCard = prob.cardIndex;
            var cards = cardProbabilities.cards;
            var card = cards[indexForNewCard];
            var stim = card.stims[prob.stimIndex];

            // Update our top-level stats
            cardProbabilities.numQuestionsIntroduced += 1;

            // If this is a resume, we've been given originally logged data
            // that we need to grab
            if (!!resumeData) {
                _.extend(card, resumeData.cardModelData);
                _.extend(currentCardInfo, resumeData.currentCardInfo);
                if (currentCardInfo.clusterIndex != indexForNewCard) {
                    console.log("Resume cluster index mismatch", currentCardInfo.clusterIndex, indexForNewCard,
                        "selectVal=", selectVal,
                        "currentCardInfo=", displayify(currentCardInfo),
                        "card=", displayify(card),
                        "prob=", displayify(prob)
                    );
                }
            }
            else {
                // If this is NOT a resume (and is just normal display mode for
                // a learner) then we need to update stats for the card
                card.trialsSinceLastSeen = 0;
                card.hasBeenIntroduced = true;
                stim.hasBeenIntroduced = true;
                if (getTestType() === 's') {
                    card.studyTrialCount += 1;
                }
            }

            // It has now been officially one more trial since all the other cards
            // have been seen - and we need to do this whether or NOT we are in
            // resume mode
            _.each(cards, function(card, index) {
                if (index != indexForNewCard) {
                    card.trialsSinceLastSeen += 1;
                }
            });
        },

        createQuestionLogEntry: function() {
            var idx = fastGetStimCluster(getCurrentClusterIndex()).clusterIndex;
            var card = cardProbabilities.cards[idx];
            return {
                'cardModelData':   _.omit(card, ["question", "answer"]),
                'currentCardInfo': _.extend({}, currentCardInfo),
                'whichStim': currentCardInfo.whichStim
            };
        },

        cardAnswered: function(wasCorrect, resumeData) {
            // Get info we need for updates and logic below
            var cards = cardProbabilities.cards;
            var cluster = fastGetStimCluster(getCurrentClusterIndex());
            var card = _.prop(cards, cluster.clusterIndex);

            // Before our study trial check, capture if this is NOT a resume
            // call (and we captured the time for the last question)
            if (!resumeData && card.lastShownTimestamp > 0) {
                var practice = Date.now() - card.lastShownTimestamp;
                // We assume more than 5 minutes is an artifact of resume logic
                if (practice < 5 * 60 * 1000) {
                    // Capture the practice time. We also know that all the
                    // other cards' "other practice" times should increase
                    card.practiceTimes.push(practice);
                    card.otherPracticeTimeSinceLast = 0;
                    _.each(cards, function(otherCard, index) {
                        if (index != cluster.clusterIndex && otherCard.firstShownTimestamp > 0) {
                            otherCard.otherPracticeTimeSinceFirst += practice;
                            otherCard.otherPracticeTimeSinceLast += practice;
                        }
                    });
                }
            }

            // Study trials are a special case: we don't update any of the
            // metrics below. As a result, we just calculate probabilities and
            // leave. Note that the calculate call is important because this is
            // the only place we call it after init *and* something might have
            // changed during question selection
            if (getTestType() === 's') {
                calculateCardProbabilities();
                return;
            }

            // "Global" stats
            cardProbabilities.numQuestionsAnswered += 1;
            if (wasCorrect) {
                cardProbabilities.numCorrectAnswers += 1;
            }

            // "Card-level" stats (and below - e.g. stim-level stats)
            if (card) {
                if (wasCorrect) card.questionSuccessCount += 1;
                else            card.questionFailureCount += 1;

                card.outcomeHistory.push(wasCorrect ? 1 : 0);

                var stim = currentCardInfo.whichStim;
                if (stim >= 0 && stim < card.stims.length) {
                    if (wasCorrect) card.stims[stim].stimSuccessCount += 1;
                    else            card.stims[stim].stimFailureCount += 1;

                    //This is called from processUserTimesLog() so this both works in memory and restoring from userTimesLog
                    card.stims[stim].outcomeHistory.push(wasCorrect ? 1 : 0);
                }
            }

            // "Response" stats
            var answerText = Answers.getDisplayAnswerText(cluster.response[currentCardInfo.whichStim]);
            if (answerText && answerText in cardProbabilities.responses) {
                if (wasCorrect) cardProbabilities.responses[answerText].responseSuccessCount += 1;
                else            cardProbabilities.responses[answerText].responseFailureCount += 1;
            }
            else {
                console.log("COULD NOT STORE RESPONSE METRICS",
                    answerText,
                    currentCardInfo.whichStim,
                    displayify(cluster.response),
                    displayify(cardProbabilities.responses));
            }

            // All stats gathered - calculate probabilities
            calculateCardProbabilities();
        },

        unitFinished: function() {
            var session = _.chain(getCurrentTdfUnit()).prop("learningsession").first().value();
            var minSecs = _.chain(session).prop("displayminseconds").first().intval(0).value();
            var maxSecs = _.chain(session).prop("displaymaxseconds").first().intval(0).value();

            if (minSecs > 0.0 || maxSecs > 0.0) {
                // We ignore practice seconds if displayXXXseconds are specified:
                // that means the unit will be over when the timer is exceeded
                // or the user clicks a button. Either way, that's handled outside
                // the engine
                return false;
            }

            // If we're still here, check practice seconds
            var practiceSeconds = getCurrentDeliveryParams().practiceseconds;
            if (practiceSeconds < 1.0) {
                //Less than a second is an error or a missing values
                console.log("No Practice Time Found and display timer: user must quit with Continue button");
                return false;
            }

            var unitElapsedTime = (Date.now() - unitStartTimestamp) / 1000.0;
            console.log("Model practice check", unitElapsedTime, ">", practiceSeconds);
            return (unitElapsedTime > practiceSeconds);
        }
    };
}

//////////////////////////////////////////////////////////////////////////////
// Return an instance of the schedule-based unit engine

function scheduleUnitEngine() {
    //Return the schedule for the current unit of the current lesson -
    //If it doesn't exist, then create and store it in User Progress
    function getSchedule() {
        //Retrieve current schedule
        var progress = getUserProgress();

        var unit = getCurrentUnitNumber();
        var schedule = null;
        if (progress.currentSchedule && progress.currentSchedule.unitNumber == unit) {
            schedule = progress.currentSchedule;
        }

        //Lazy create save if we don't have a correct schedule
        if (schedule === null) {
            console.log("CREATING SCHEDULE, showing progress");
            console.log(progress);

            var file = getCurrentTdfFile();
            var setSpec = file.tdfs.tutor.setspec[0];
            var currUnit = file.tdfs.tutor.unit[unit];

            schedule = AssessmentSession.createSchedule(setSpec, unit, currUnit);
            if (!schedule) {
                //There was an error creating the schedule - there's really nothing
                //left to do since the experiment is broken
                recordUserTime("FAILURE to create schedule", {
                    unitname: _.display(currUnit.unitname),
                    unitindex: unit
                });
                alert("There is an issue with the TDF - experiment cannot continue");
                throw new Error("There is an issue with the TDF - experiment cannot continue");
            }

            //We save the current schedule and also log it to the UserTime collection
            progress.currentSchedule = schedule;

            recordUserTime("schedule", {
                unitname: _.display(currUnit.unitname),
                unitindex: unit,
                schedule: schedule
            });
        }

        //Now they can have the schedule
        return schedule;
    }

    return {
        unitType: "schedule",

        initImpl: function() {
            //Nothing currently
        },

        selectNextCard: function() {
            // currently unused: var unit = getCurrentUnitNumber();
            var questionIndex = Session.get("questionIndex");
            var questInfo = getSchedule().q[questionIndex];
            var whichStim = questInfo.whichStim;

            //Set current Q/A info, type of test (drill, test, study), and then
            //increment the session's question index number
            setCurrentClusterIndex(questInfo.clusterIndex);
            Session.set("currentQuestion", getCurrentStimQuestion(whichStim));
            var currentQuestion = Session.get("currentQuestion");
            //If we have a dual prompt question populate the spare data field
            if(currentQuestion.indexOf("|") != -1){

              var prompts = currentQuestion.split("|");
              Session.set("currentQuestion",prompts[0]);
              Session.set("currentQuestionPart2",prompts[1]);
              console.log("two part question detected: " + prompts[0] + ",,," + prompts[1]);
            }else{
              console.log("one part question detected");
              Session.set("currentQuestionPart2",undefined);
            }
            Session.set("currentAnswer", getCurrentStimAnswer(whichStim));
            Session.set("testType", questInfo.testType);
            Session.set("questionIndex", questionIndex + 1);
            Session.set("showOverlearningText", false);  //No overlearning in a schedule

            console.log("SCHEDULE UNIT card selection => ",
                "cluster-idx-unmapped:", questInfo.clusterIndex,
                "whichStim:", whichStim,
                "parameter", getCurrentStimParameter(whichStim)
            );

            return questInfo.clusterIndex;
        },

        findCurrentCardInfo: function() {
            //selectNextCard increments questionIndex after setting all card
            //info, so we need to use -1 for this info
            return getSchedule().q[Session.get("questionIndex") - 1];
        },

        cardSelected: function(selectVal, resumeData) {
            //Nothing currently
        },

        createQuestionLogEntry: function() {
            var questInfo = this.findCurrentCardInfo();

            try {
                return {
                    'whichStim': questInfo.whichStim
                };
            }
            catch(e) {
                console.log(e);
                throw e;
            }

        },

        cardAnswered: function(wasCorrect, resumeData) {
            //Nothing currently
        },

        unitFinished: function() {
            var questionIndex = Session.get("questionIndex");
            var unit = getCurrentUnitNumber();
            var schedule = null;
            if (unit < getCurrentTdfFile().tdfs.tutor.unit.length) {
                schedule = getSchedule();
            }

            if (schedule && questionIndex < schedule.q.length) {
                return false; // have more
            }
            else {
                return true; // nothing left
            }
        }
    };
}
