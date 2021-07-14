import { MULTITDF_MAIN_CLUSTER_UNIT } from "../../../common/Definitions";
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

--------------------------------------------------------

Cluster mapping is created and maintained by resume logic in card.js. It is
honored by the utility functions in currentTestingHelpers.js. The mapping is
based on the top-level shuffle/swap-type cluster mapping. Generally this
mapping should be remembered per-user per-experiment after creation and
honored across all session types.

******************************************************************************/

//Helper for our "public" functions
function create(func,extensionData) {
    var engine = _.extend(defaultUnitEngine(extensionData), func());
    engine.init();
    return engine;
}

// Our "public" functions

getRandomInt = function(max){
    return Math.floor(Math.random() * max);
}

stripSpacesAndLowerCase = function(input){
  return input.replace(/ /g,'').toLowerCase();
}

createEmptyUnit = function(extensionData) {
    return create(emptyUnitEngine,extensionData);
};

createModelUnit = function(extensionData) {
    return create(modelUnitEngine,extensionData);
};

createScheduleUnit = function(extensionData) {
    return create(scheduleUnitEngine,extensionData);
};

// Return an instance of the "base" engine
function defaultUnitEngine(extensionData) {
    let engine = {
        // Things actual engines must supply
        unitType: "DEFAULT",
        selectNextCard: function() { throw "Missing Implementation"; },
        cardSelected: function(selectVal, resumeData) { throw "Missing Implementation"; },
        createQuestionLogEntry: function() { throw "Missing Implementation"; },
        cardAnswered: function(wasCorrect, resumeData) { throw "Missing Implementation"; },
        unitFinished: function() { throw "Missing Implementation"; },

        // Optional functions that engines can replace if they want
        initImpl: function() { },
        reinitializeClusterListsFromCurrentSessionData: function() { },

        // Functions we supply
        init: function() {
            console.log("Engine created for unit:", this.unitType);
            this.initImpl();
        },

        writeQuestionEntry: function(selectVal) {
            recordUserTimeQuestion(
                _.extend(
                    { selType: this.unitType, 'selectVal': selectVal },
                    this.createQuestionLogEntry()
                )
            );
        },

        getSubClozeAnswerSyllables: function(answer,displaySyllableIndices,cachedSyllables){
            console.log("!!!displaySyllableIndices: ",displaySyllableIndices,", this.cachedSyllables: ",cachedSyllables);
            if(typeof(displaySyllableIndices) === "undefined" || !cachedSyllables || displaySyllableIndices.length == 0){
                console.log("no syllable index or cachedSyllables, defaulting to no subclozeanswer");
                return undefined;
            }else{
                answer = answer.replace(/\./g,'_');
                let syllableArray = cachedSyllables.data[answer].syllables;
                return {syllableArray,displaySyllableIndices};
            }
        },

        replaceClozeWithSyllables: function(question,currentAnswerSyllables, origAnswer){
            console.log("replaceClozeWithSyllables1",question,currentAnswerSyllables, origAnswer);
            if(typeof(question) === "undefined"){
                return {
                    clozeQuestion: undefined,
                    clozeMissingSyllables: undefined
                }
            }

            let clozeAnswer = "";
            let clozeMissingSyllables = ""
            let syllablesArray = currentAnswerSyllables.syllableArray;
            let syllableIndices = currentAnswerSyllables.displaySyllableIndices;
            let reconstructedAnswer = "";
            let clozeAnswerOnlyUnderscores = "";
            let clozeAnswerNoUnderscores = "";

            for(let index in syllablesArray){
                index = parseInt(index);
                if(syllableIndices.indexOf(index) != -1){
                    clozeAnswer += syllablesArray[index];
                    clozeAnswerNoUnderscores += syllablesArray[index];
                }else{
                    // Handle underscores for syllable array elements that contain whitespace
                    if (syllablesArray[index].indexOf(' ') >= 0) {
                        clozeAnswer += "__ __";
                        clozeAnswerOnlyUnderscores += "__ __"
                        clozeMissingSyllables += syllablesArray[index];
                    } else {
                        clozeAnswer += "____";
                        clozeAnswerOnlyUnderscores += "____";
                        clozeMissingSyllables += syllablesArray[index];
                    }
                }

                reconstructedAnswer += syllablesArray[index];
                let nextChar = reconstructedAnswer.length;
                while(origAnswer.charAt(nextChar) == " "){
                    clozeAnswer += " ";
                    reconstructedAnswer += " ";
                    clozeMissingSyllables += " ";
                    clozeAnswerOnlyUnderscores += " ";
                    clozeAnswerNoUnderscores += " ";
                    nextChar = reconstructedAnswer.length;
                }
            }

            let clozeQuestionParts = question.split(/([_]+[ ]?)+/);
            clozeQuestionParts.splice(1,1);
            clozeQuestionParts.splice(1,0,clozeAnswerNoUnderscores.trim());
            clozeQuestionParts[2] = clozeAnswerOnlyUnderscores + " " + clozeQuestionParts[2];

            // If our third cloze part begins with an underscore,
            // our second cloze part should be our syllables, so
            // if the answer sans underscores doesn't end in whitespace,
            // remove leading whitespace from part 3
            if (clozeQuestionParts[2].trim().charAt(0) === "_"
                && clozeAnswerNoUnderscores.slice(-1) != " ") {
                clozeQuestionParts[2] = clozeQuestionParts[2].trim();
            }

            let clozeQuestion = question.replace(/([_]+[ ]?)+/,clozeAnswer + " ");

            return { clozeQuestion, clozeMissingSyllables, clozeQuestionParts };
        },

        setUpCardQuestionSyllables: function(currentQuestion, currentQuestionPart2, currentStimAnswer,prob){
            console.log("setUpCardQuestionSyllables1: ",currentQuestion,currentQuestionPart2,currentStimAnswer,prob);
            let currentAnswer = currentStimAnswer;
            let clozeQuestionParts = undefined;
            let currentAnswerSyllables = undefined;

            //For now this distinguishes model engine from schedule engine, which doesn't do syllable replacement
            if(prob){
                currentAnswerSyllables = this.getSubClozeAnswerSyllables(currentStimAnswer,prob.probFunctionsParameters.hintsylls,this.cachedSyllables);

                if(currentAnswerSyllables){
                    let {clozeQuestion,clozeMissingSyllables,clozeQuestionParts:cQuestionParts} = this.replaceClozeWithSyllables(
                        currentQuestion,currentAnswerSyllables,currentStimAnswer);
                    currentQuestion = clozeQuestion;
                    currentAnswer = clozeMissingSyllables;
                    clozeQuestionParts = cQuestionParts;
                    console.log("clozeQuestionParts:",cQuestionParts);
                    let {clozeQuestion2,clozeMissingSyllables2,...rest} = this.replaceClozeWithSyllables(
                        currentQuestionPart2,currentAnswerSyllables,currentStimAnswer);
                    currentQuestionPart2 = clozeQuestion2; //TODO we should use clozeMissingSyllables2 probably, doubtful that syllables will work with two part questions for now
                }
            }

            console.log("setUpCardQuestionSyllables2:",currentQuestion,currentQuestionPart2,currentAnswerSyllables,clozeQuestionParts,currentAnswer);
            return {currentQuestion,currentQuestionPart2,currentAnswerSyllables,clozeQuestionParts,currentAnswer};
        },

        setUpCardQuestionAndAnswerGlobals: function(cardIndex, whichStim, prob){
            Session.set("alternateDisplayIndex",undefined);
            let curStim = getStimCluster(cardIndex).stims[whichStim];
            let currentDisplay = JSON.parse(JSON.stringify(curStim.display));
            if(curStim.alternateDisplays){
                let numPotentialDisplays = curStim.alternateDisplays.length + 1;
                let displayIndex = Math.floor(numPotentialDisplays * Math.random());
                if(displayIndex < curStim.alternateDisplays.length){
                    Session.set("alternateDisplayIndex",displayIndex);
                    currentDisplay = JSON.parse(JSON.stringify(curStim.alternateDisplays[displayIndex]));
                }
            }
            Session.set("originalDisplay", JSON.parse(JSON.stringify(currentDisplay)));

            let currentQuestion = currentDisplay.text || currentDisplay.clozeText;
            let currentQuestionPart2 = undefined;
            let currentStimAnswer = getStimAnswer(cardIndex, whichStim);
            Session.set("originalAnswer",currentStimAnswer);
            currentStimAnswer = currentStimAnswer.toLowerCase();

            //If we have a dual prompt question populate the spare data field
            if(currentQuestion && currentQuestion.indexOf("|") != -1){
                var prompts = currentQuestion.split("|");
                currentQuestion = prompts[0];
                currentQuestionPart2 = prompts[1];
            }
            Session.set("originalQuestion",currentQuestion);
            Session.set("originalQuestion2",currentQuestionPart2);

            let currentAnswerSyllables, clozeQuestionParts, currentAnswer;

            ({currentQuestion,currentQuestionPart2,currentAnswerSyllables,clozeQuestionParts,currentAnswer} = this.setUpCardQuestionSyllables(currentQuestion,currentQuestionPart2,currentStimAnswer,prob));

            if(currentAnswerSyllables){
                curStim.answerSyllables = currentAnswerSyllables;
            }
            Session.set("currentAnswerSyllables",currentAnswerSyllables);
            Session.set("currentAnswer",currentAnswer);
            Session.set("clozeQuestionParts",clozeQuestionParts);
            Session.set("currentQuestionPart2",currentQuestionPart2);

            if(!!(currentDisplay.text)){
                currentDisplay.text = currentQuestion;
            }else if(!!(currentDisplay.clozeText)){
                currentDisplay.clozeText = currentQuestion;
            }

            Session.set("currentDisplayEngine",currentDisplay);
        }
    };
    console.log("extension data: ",extensionData);
    return _.extend(engine,extensionData);
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

    //We cache the stimuli found since it shouldn't change during the unit
    var cachedStimuli = null;
    fastGetStimCluster =function(index) {
        if (!cachedStimuli) {
            cachedStimuli = Stimuli.findOne({fileName: getCurrentStimName()});
        }
        return getStimCluster(index, cachedStimuli);
    }

    function getStimParameterArray(clusterIndex,whichParameter){
      return _.chain(fastGetStimCluster(clusterIndex))
            .prop("stims")
            .prop(_.intval(whichParameter))
            .prop("parameter")
            .split(',')
            .map(x => _.floatval(x))
            .value();
    }

    fastGetStimDisplay = function(index, whichQuestion) {
        let display = fastGetStimCluster(index).stims[whichQuestion].display;
        return display;
    }

    function fastGetStimAnswer(index, whichAnswer) {
        return fastGetStimCluster(index).stims[whichAnswer].response.correctResponse;
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
    cardProbabilities = [];
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

    //TODO: do this function without side effects on cards
    function setUpClusterList(cards){
        const currentTdfFile = getCurrentTdfFile();
        const isMultiTdf = currentTdfFile.isMultiTdf;
        let clusterList = [];

        if(isMultiTdf){
            const curUnitNumber = Session.get("currentUnitNumber");

            //NOTE: We are currently assuming that multiTdfs will have only two units: an assessment session with exactly one question which is the last
            //item in the stim file, and a unit with all clusters specified in the generated subtdfs array
            if(curUnitNumber == MULTITDF_MAIN_CLUSTER_UNIT){
                const subTdfIndex = Session.get("subTdfIndex");
                if(typeof(subTdfIndex) == "undefined"){
                    console.log("assuming we are in studentReporting, therefore ignoring the clusterlists"); //TODO, make this an explicit argument and error when it happens if we don't pass in the argument
                }else{
                    const unitClusterList = currentTdfFile.subTdfs[subTdfIndex].clusterList;
                    Helpers.extractDelimFields(unitClusterList, clusterList);
                }
            }else if(curUnitNumber > 2){
                throw new Error("We shouldn't ever get here, dynamic tdf cluster list error");
            }
        }else{
            // Figure out which cluster numbers that they want
            const unitClusterList = _.chain(getCurrentTdfUnit())
            .prop("learningsession").first()
            .prop("clusterlist").trim().value();
            Helpers.extractDelimFields(unitClusterList, clusterList);
        }

        for (i = 0; i < clusterList.length; ++i) {
            var nums = Helpers.rangeVal(clusterList[i]);
            for (j = 0; j < nums.length; ++j) {
                cards[_.intval(nums[j])].canUse = true;
            }
        }
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
                hasBeenIntroduced: false,
                outcomeHistory: [],
                lastShownTimestamp: 0,
                firstShownTimestamp: 0,
                otherPracticeTimeSinceFirst: 0,
                otherPracticeTimeSinceLast: 0,
                previousCalculatedProbabilities: [],
                studyTrialCount: 0,
                trialsSinceLastSeen: 3,  // We start at >2 for initial logic (see findMin/Max functions below)
                practiceTimes: [],
                canUse: false,
                stims: [],
            };

            // We keep per-stim and re-response-text results as well
            var cluster = fastGetStimCluster(i);
            var numStims = _.chain(cluster).prop("stims").prop("length").intval().value();
            for (j = 0; j < numStims; ++j) {
                var parameter = getStimParameterArray(i,j); //Note this may be a single element array for older stims or a 3 digit array for newer ones
                // Per-stim counts
                card.stims.push({
                    stimSuccessCount: 0,
                    stimFailureCount: 0,
                    hasBeenIntroduced: false,
                    outcomeHistory: [],
                    lastShownTimestamp: 0,
                    firstShownTimestamp: 0,
                    otherPracticeTimeSinceFirst: 0,
                    otherPracticeTimeSinceLast: 0,
                    previousCalculatedProbabilities: [],
                    parameter: parameter,
                });

                initProbs.push({
                    cardIndex: i,
                    stimIndex: j,
                    probability: 0
                });

                // Per-response counts
                var response = stripSpacesAndLowerCase(Answers.getDisplayAnswerText(cluster.stims[j].response.correctResponse));
                if (!(response in initResponses)) {
                    initResponses[response] = {
                        responseSuccessCount: 0,
                        responseFailureCount: 0,
                        lastShownTimestamp: 0,
                        outcomeHistory: [],
                    };
                }
            }

            initCards.push(card);
        }

        setUpClusterList(initCards);

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

        p.y = p.stimParameters[0] +
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
    var probFunctionHasHintSylls = typeof(probFunction) == "undefined" ? false : probFunction.indexOf("hintsylls") > -1;
    console.log("probFunctionHasHintSylls: " + probFunctionHasHintSylls);
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

        // Store parameters in an object for easy logging/debugging
        var p = {};

        //Current Indices
        p.clusterIndex = prob.cardIndex;
        p.stimIndex = prob.stimIndex;

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
        p.stimSecsSinceLastShown = elapsed(stim.lastShownTimestamp);
        p.stimSecsSinceFirstShown = elapsed(stim.firstShownTimestamp);
        p.stimSecsPracticingOthers = secs(stim.otherPracticeTimeSinceFirst);

        p.stimSuccessCount = stim.stimSuccessCount;
        p.stimFailureCount = stim.stimFailureCount;
        let answerText = Answers.getDisplayAnswerText(fastGetStimAnswer(prob.cardIndex, prob.stimIndex)).toLowerCase();
        p.stimResponseText = stripSpacesAndLowerCase(answerText); //Yes, lowercasing here is redundant. TODO: fix/cleanup
        let curStimFile = getCurrentStimName().replace(/\./g,'_');
        answerText = answerText.replace(/\./g,'_');

        if(probFunctionHasHintSylls){
            if(!this.cachedSyllables.data || !this.cachedSyllables.data[answerText]){
                console.log("no cached syllables for: " + curStimFile + "|" + answerText);
                throw new Error("can't find syllable data in database");
            }else{
                let stimSyllableData = this.cachedSyllables.data[answerText];
                p.syllables = stimSyllableData.count;
                p.syllablesArray = stimSyllableData.syllables;
            }
        }

        p.resp = cardProbabilities.responses[p.stimResponseText];
        p.responseSuccessCount = p.resp.responseSuccessCount;
        p.responseFailureCount = p.resp.responseFailureCount;
        p.responseOutcomeHistory = p.resp.outcomeHistory;
        p.responseSecsSinceLastShown = elapsed(p.resp.lastShownTimestamp);

        p.stimParameters = getStimParameterArray(prob.cardIndex,prob.stimIndex);

        p.clusterPreviousCalculatedProbabilities = JSON.parse(JSON.stringify(card.previousCalculatedProbabilities));
        p.clusterOutcomeHistory = JSON.parse(JSON.stringify(card.outcomeHistory));

        p.stimPreviousCalculatedProbabilities = JSON.parse(JSON.stringify(stim.previousCalculatedProbabilities));
        p.stimOutcomeHistory = stim.outcomeHistory;
        //console.log("stimOutcomeHistory: " + p.stimOutcomeHistory);

        p.overallOutcomeHistory = getUserProgress().overallOutcomeHistory;

        //console.log("p.overallOutcomeHistory: " + p.overallOutcomeHistory);

        return probFunction(p);
    }

    // Calculate current card probabilities for every card - see selectNextCard
    // the actual card/stim (cluster/version) selection
    calculateCardProbabilities = function() {
        // We use a "flat" probability structure - this is faster than a loop
        // over our nested data structure, but it also gives us more readable
        // code when we're setting something per stimulus
        var probs = cardProbabilities.probs;
        var ptemp = [];
        for (var i = 0; i < probs.length; ++i) {
            // card.canUse is true if and only if it is in the clusterlist
            // for the current unit. You could just return here if these clusters
            // should be ignored (or do nothing if they should be included below)
            var parms = calculateSingleProb(probs[i]);
            probs[i].probFunctionsParameters = parms;
            probs[i].probability = parms.probability;
            ptemp[i]=Math.round(100*parms.probability)/100;

        }
        console.log(JSON.stringify(ptemp));
        return cardProbabilities.probs;
    }

    // Return index of PROB with minimum probability that was last seen at least
    // 2 trials ago. Default to index 0 in case no probs meet this criterion
    function findMinProbCard(cards, probs) {
        var currentMin = 1.00001;
        var indexToReturn = 0;

        for (var i = probs.length - 1; i >= 0; --i) {
            var prob = probs[i];
            var card = cards[prob.cardIndex];

            if (card.canUse && card.trialsSinceLastSeen > 1) {
                if (prob.probability <= currentMin) {   // Note that this is stim probability
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

            if (card.canUse && card.trialsSinceLastSeen > 1) {
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
      var currentMin = 50.0; //Magic number to indicate greater than highest possible distance to start
      var indexToReturn = 0;

      for (var i = probs.length - 1; i >= 0; --i) {
          var prob = probs[i];
          var card = cards[prob.cardIndex];
          var parameters = card.stims[prob.stimIndex].parameter;
          var optimalProb = Math.log(parameters[1]/(1-parameters[1]));
          if(!optimalProb){
            //console.log("NO OPTIMAL PROB SPECIFIED IN STIM, DEFAULTING TO 0.90");
            optimalProb = 0.90;
          }
          //console.log("!!!parameters: " + JSON.stringify(parameters) + ", optimalProb: " + optimalProb);

          if (card.canUse && card.trialsSinceLastSeen > 1) {
              var dist = Math.abs(Math.log(prob.probability/(1-prob.probability)) - optimalProb)

            //  console.log(dist)
              // Note that we are checking stim probability
              if (dist <= currentMin) {
                  currentMin = dist;
                  indexToReturn = i;
              }
          }
      }

      return indexToReturn;
    }

    function findMaxProbCardThresholdCeilingPerCard(cards,probs){

      var currentMax = 0;
      var indexToReturn = -1;

      for (var i = probs.length - 1; i >= 0; --i) {
          var prob = probs[i];
          var card = cards[prob.cardIndex];
          var parameters = card.stims[prob.stimIndex].parameter;

          var thresholdCeiling = parameters[1];
          if(!thresholdCeiling){
          //  console.log("NO THRESHOLD CEILING SPECIFIED IN STIM, DEFAULTING TO 0.90");
            thresholdCeiling = 0.90;
          }
          //console.log("!!!parameters: " + JSON.stringify(parameters) + ", thresholdCeiling: " + thresholdCeiling + ", card: " + JSON.stringify(card));

          if (card.canUse && card.trialsSinceLastSeen > 1) {
              // Note that we are checking stim probability
              if (prob.probability >= currentMax && prob.probability < thresholdCeiling) {
                  currentMax = prob.probability;
                  indexToReturn = i;
              }
          }
      }

      return indexToReturn;
    }

    function updateCardAndStimData(cardIndex, whichStim, resumeData){
        let card = cardProbabilities.cards[cardIndex];
        let stim = card.stims[whichStim];
        let responseText = stripSpacesAndLowerCase(Answers.getDisplayAnswerText(fastGetStimAnswer(cardIndex,whichStim)));

        // About to show a card - record any times necessary
        card.lastShownTimestamp = Date.now();
        if (card.firstShownTimestamp < 1 && card.lastShownTimestamp > 0) {
            card.firstShownTimestamp = card.lastShownTimestamp;
        }

        stim.lastShownTimestamp = Date.now();
        if(stim.firstShownTimestamp < 1 && stim.lastTimestamp > 0) {
          stim.firstShownTimestamp = stim.lastShownTimestamp;
        }

        if (responseText && responseText in cardProbabilities.responses) {
            resp = cardProbabilities.responses[responseText];
            resp.lastShownTimestamp = Date.now();
            if(resumeData && resumeData.responseData.responseText == responseText){
                resp.lastShownTimestamp = Math.max(resumeData.responseData.lastShownTimestamp,resp.lastShownTimestamp);
            }
        }

        // If this is a resume, we've been given originally logged data
        // that we need to grab
        if (!!resumeData) {
            _.extend(card, resumeData.cardModelData);
            _.extend(currentCardInfo, resumeData.currentCardInfo);

            if (currentCardInfo.clusterIndex != cardIndex) {
                console.log("Resume cluster index mismatch", currentCardInfo.clusterIndex, cardIndex,
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
    }

    //Our actual implementation
    return {
        getCardProbabilitiesNoCalc: function(){
            return cardProbabilities;
        },

        getCardProbs: function(){
          return calculateCardProbabilities();
        },

        findCurrentCardInfo: function() {
            return currentCardInfo;
        },

        reinitializeClusterListsFromCurrentSessionData: function(){
            setUpClusterList(cardProbabilities.cards);
        },

        unitType: "model",

        unitMode: (function(){
          var unitMode = _.chain(getCurrentTdfUnit())
              .prop("learningsession").first()
              .prop("unitMode").trim().value() || "default";
          console.log("UNIT MODE: " + unitMode);
          return unitMode;
        })(),

        initImpl: function() {
            initializeActRModel();
        },

        selectNextCard: function() {
            // The cluster (card) index, the cluster version (stim index), and
            // whether or not we should show the overlearning text is determined
            // here. See calculateCardProbabilities for how prob.probability is
            // calculated
            let newProbIndex;
            let cards = cardProbabilities.cards;
            let probs = cardProbabilities.probs;

            console.log("selectNextCard unitMode: " + this.unitMode);

            switch(this.unitMode){
              case 'thresholdCeiling':
                newProbIndex = findMaxProbCardThresholdCeilingPerCard(cards, probs);
                if (newProbIndex === -1) {
                    newProbIndex = findMinProbCard(cards, probs);
                }
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
            let prob = cardProbabilities.probs[newProbIndex];
            let cardIndex = prob.cardIndex;
            let card = cardProbabilities.cards[cardIndex];
            let whichStim = prob.stimIndex;
            let stim = card.stims[whichStim];

            // Store calculated probability for selected stim/cluster
            let currentStimProbability = prob.probability;
            stim.previousCalculatedProbabilities.push(currentStimProbability);
            card.previousCalculatedProbabilities.push(currentStimProbability);

            // Save the card selection
            // Note that we always take the first stimulus and it's always a drill
            setCurrentClusterIndex(cardIndex);

            //Save for returning the info later (since we don't have a schedule)
            setCurrentCardInfo(cardIndex, whichStim);

            this.setUpCardQuestionAndAnswerGlobals(cardIndex, whichStim, prob);

            return newProbIndex; //Must return index for call to cardSelected
        },

        cardSelected: function(selectVal, resumeData) {
            // Find objects we'll be touching
            let probIndex = _.intval(selectVal);  // See selectNextCard
            let prob = cardProbabilities.probs[probIndex];
            let cardIndex = prob.cardIndex;
            let whichStim = prob.stimIndex;
            let card = cardProbabilities.cards[cardIndex];
            let stim = card.stims[whichStim];

            if(getCurrentDeliveryParams().studyFirst && card.studyTrialCount == 0){
              console.log("!!! STUDY FOR FIRST TRIAL");
              Session.set("testType",'s');
            }else{
              Session.set("testType", "d");
            }
            Session.set("questionIndex", 1);  //questionIndex doesn't have any meaning for a model
            Session.set("showOverlearningText", false);

            updateCardAndStimData(cardIndex, whichStim, resumeData);

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
                console.log("Model selected stim:", displayify(stim));

                // Log time stats in human-readable form
                var secsStr = function(t) { return secs(t) + ' secs'; };
                var elapsedStr = function(t) { return t < 1 ? 'Never Seen': secs(Date.now() - t); };
                console.log(
                    'Card First Seen:', elapsedStr(card.firstShownTimestamp),
                    'Card Last Seen:', elapsedStr(card.lastShownTimestamp),
                    'Total time in practice:', secsStr(_.sum(card.practiceTimes)),
                    'Previous Practice Times:', displayify(_.map(card.practiceTimes, secsStr)),
                    'Total time in other practice:', secs(card.otherPracticeTimeSinceFirst),
                    'Stim First Seen:', elapsedStr(stim.firstShownTimestamp),
                    'Stim Last Seen:',elapsedStr(stim.lastShownTimestamp),
                    'Stim Total time in other practice:', secs(stim.otherPracticeTimeSinceFirst)
                );

                // Display response and current response stats
                let responseText = stripSpacesAndLowerCase(Answers.getDisplayAnswerText(fastGetStimAnswer(cardIndex,whichStim)));
                if(responseText && responseText in cardProbabilities.responses){
                    console.log("Response is", responseText, displayify(cardProbabilities.responses[responseText]));
                }

                console.log("<<<END   METRICS<<<<<<<");
            }

            // Update our top-level stats
            cardProbabilities.numQuestionsIntroduced += 1;

            // It has now been officially one more trial since all the other cards
            // have been seen - and we need to do this whether or NOT we are in
            // resume mode
            _.each(cardProbabilities.cards, function(card, index) {
                if (index != cardIndex) {
                    card.trialsSinceLastSeen += 1;
                }
            });
        },

        createQuestionLogEntry: function() {
            let idx = getCurrentClusterIndex();
            let card = cardProbabilities.cards[idx];
            let cluster = fastGetStimCluster(getCurrentClusterIndex());
            let responseText = stripSpacesAndLowerCase(Answers.getDisplayAnswerText(cluster.stims[currentCardInfo.whichStim].response.correctResponse));
            let responseData = {
              responseText: responseText,
              lastShownTimestamp: Date.now()
            };
            return {
                'cardModelData':   _.omit(card, ["question", "answer"]),
                'currentCardInfo': _.extend({}, currentCardInfo),
                'responseData': responseData,
                'whichStim': currentCardInfo.whichStim
            };
        },

        cardAnswered: function(wasCorrect, resumeData) {
            // Get info we need for updates and logic below
            let cards = cardProbabilities.cards;
            let cluster = fastGetStimCluster(getCurrentClusterIndex());
            let card = _.prop(cards, cluster.shufIndex);
            console.log("cardAnswered, card: " + JSON.stringify(card) + "cluster.shufIndex: " + cluster.shufIndex);

            // Before our study trial check, capture if this is NOT a resume
            // call (and we captured the time for the last question)
            if (!resumeData && card.lastShownTimestamp > 0) {
                let practice = Date.now() - card.lastShownTimestamp;
                // We assume more than 5 minutes is an artifact of resume logic
                if (practice < 5 * 60 * 1000) {
                    // Capture the practice time. We also know that all the
                    // other cards' "other practice" times should increase
                    card.practiceTimes.push(practice);
                    card.otherPracticeTimeSinceLast = 0;
                    _.each(cards, function(otherCard, index) {
                      if(otherCard.firstShownTimestamp > 0){
                        if (index != cluster.shufIndex) {
                            otherCard.otherPracticeTimeSinceFirst += practice;
                            otherCard.otherPracticeTimeSinceLast += practice;
                            _.each(otherCard.stims, function(otherStim, index){
                              otherStim.otherPracticeTimeSinceFirst += practice;
                              otherStim.otherPracticeTimeSinceLast += practice;
                            });
                        }else{
                          _.each(otherCard.stims, function(otherStim, index){
                            if(index != currentCardInfo.whichStim){
                              otherStim.otherPracticeTimeSinceFirst += practice;
                              otherStim.otherPracticeTimeSinceLast += practice;
                            }
                          });
                        }
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
                console.log("card exists");
                if (wasCorrect) card.questionSuccessCount += 1;
                else            card.questionFailureCount += 1;

                console.log("cardoutcomehistory before: " + JSON.stringify(card.outcomeHistory));
                card.outcomeHistory.push(wasCorrect ? 1 : 0);
                console.log("cardoutcomehistory after: " + JSON.stringify(card.outcomeHistory));
                let stim = currentCardInfo.whichStim;
                if (stim >= 0 && stim < card.stims.length) {
                    if (wasCorrect) card.stims[stim].stimSuccessCount += 1;
                    else            card.stims[stim].stimFailureCount += 1;

                    //This is called from processUserTimesLog() so this both works in memory and restoring from userTimesLog
                    card.stims[stim].outcomeHistory.push(wasCorrect ? 1 : 0);
                }
            }

            // "Response" stats
            let answerText = stripSpacesAndLowerCase(Answers.getDisplayAnswerText(cluster.stims[currentCardInfo.whichStim].response.correctResponse));
            if (answerText && answerText in cardProbabilities.responses) {
                let resp = cardProbabilities.responses[answerText];
                if (wasCorrect) resp.responseSuccessCount += 1;
                else            resp.responseFailureCount += 1;

                console.log("resp.outcomeHistory before: " + JSON.stringify(resp.outcomeHistory));
                resp.outcomeHistory.push(wasCorrect ? 1 : 0);
                console.log("resp.outcomeHistory after: " + JSON.stringify(resp.outcomeHistory));
            }
            else {
                console.log("COULD NOT STORE RESPONSE METRICS",
                    answerText,
                    currentCardInfo.whichStim,
                    displayify(cluster.stims[currentCardInfo.whichStim].response.correctResponse),
                    displayify(cardProbabilities.responses));
            }

            // All stats gathered - calculate probabilities
            //Need a delay so that the outcomehistory arrays can be properly updated
            //before we use them in calculateCardProbabilities
            //Meteor.setTimeout(calculateCardProbabilities,20); //TODO: why did we need this?  Make sure we are calculating correct values now
            calculateCardProbabilities();
        },

        unitFinished: function() {
            var session = _.chain(getCurrentTdfUnit()).prop("learningsession").first().value();
            var minSecs = _.chain(session).prop("displayminseconds").first().intval(0).value();
            var maxSecs = _.chain(session).prop("displaymaxseconds").first().intval(0).value();
            let maxTrials = _.chain(session).prop("maxTrials").first().intval(0).value();
            let numTrialsSoFar = cardProbabilities.numQuestionsIntroduced;

            if(maxTrials > 0 && numTrialsSoFar >= maxTrials){
                return true;
            }

            //TODO: why are we using side effects to handle the unit being finished? Fix this
            if (minSecs > 0.0 || maxSecs > 0.0) {
                // We ignore practice seconds if displayXXXseconds are specified:
                // that means the unit will be over when the timer is exceeded
                // or the user clicks a button. Either way, that's handled outside
                // the engine
                return false;
            }

            //TODO: we should probably remove this as it's been superceded by displayminseconds/displaymaxseconds
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

function scheduleUnitEngine(){
    return {
        unitType: "schedule",

        initImpl: function() {
            //Nothing currently
        },

        getSchedule: function() {
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
        },

        selectNextCard: function() {
            let questionIndex = Session.get("questionIndex");
            let questInfo = this.getSchedule().q[questionIndex];
            let curClusterIndex = questInfo.clusterIndex;
            let curStimIndex = questInfo.whichStim;

            //Set current Q/A info, type of test (drill, test, study), and then
            //increment the session's question index number
            setCurrentClusterIndex(curClusterIndex);

            this.setUpCardQuestionAndAnswerGlobals(curClusterIndex, curStimIndex, undefined);

            Session.set("testType", questInfo.testType);
            Session.set("questionIndex", questionIndex + 1);
            Session.set("showOverlearningText", false);  //No overlearning in a schedule

            console.log("SCHEDULE UNIT card selection => ",
                "cluster-idx-unmapped:", curClusterIndex,
                "whichStim:", curStimIndex
            );

            return curClusterIndex;
        },

        findCurrentCardInfo: function() {
            //selectNextCard increments questionIndex after setting all card
            //info, so we need to use -1 for this info
            return this.getSchedule().q[Session.get("questionIndex") - 1];
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
                schedule = this.getSchedule();
            }

            if (schedule && questionIndex < schedule.q.length) {
                return false; // have more
            }
            else {
                return true; // nothing left
            }
        }
    }
}
