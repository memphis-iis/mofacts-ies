import { ALL_TDFS } from "../../../common/Definitions";

Session.set("studentReportingTdfs",[]);
Session.set("curStudentPerformance",{});
Session.set("curSelectedTdf","");

loadedLabels = false;
const numTrialsForKCLearningCurve = 5;
//currentUserTimeLogs = undefined;
curTracker = undefined;
tempModelUnitEngine = undefined;

Template.studentReporting.helpers({
  tdfs: function(){
    return Session.get("studentReportingTdfs");
  },

  curClassStudentTotals: function(){
    return Session.get("curClassStudentTotals");
  },

  curClass: function(){
    return Session.get("curClass");
  },

  curStudentPerformance: function(){
    return Session.get("curStudentPerformance");
  },

  studentUsername: function(){
    //If we're navigating from the teacher reporting page we'll set the
    //studentUsername session variable.  Otherwise just display the info for the
    //current user
    return Session.get("studentUsername") || Meteor.user().username;
  }
});

setTdfFileNamesAndDisplayValues = function(){
  console.log("setTdfFileNamesAndDisplayValues");
  let tdfsInScopeForReporting = [];
  let curClassTdfs;
  let studentClass = Session.get("curClass");
  if(studentClass && studentClass.tdfs){
    curClassTdfs = [];
    for(let tdf of studentClass.tdfs){
      curClassTdfs.push(tdf.fileName);
    }
    console.log("curClassTdfs: " + curClassTdfs);
  }

  let studentID = Session.get("curStudentID");
  Meteor.subscribe('specificUserMetrics',studentID,function(){
    UserMetrics.find({_id:studentID}).forEach(function(entry){
      let candidateTdfs = Object.keys(entry).filter(x => x.indexOf(ALL_TDFS) != -1);
      candidateTdfs = candidateTdfs.map(x => x.replace("_xml",".xml"));
      if(curClassTdfs){
        candidateTdfs = candidateTdfs.filter(x => curClassTdfs.indexOf(x) != -1);
      }
      tdfsInScopeForReporting.push(...candidateTdfs);
    });
    
    studentReportingTdfs = [];
    Meteor.subscribe('tdfs',function(){
      console.log("tdfs subscribe back");
      Meteor.subscribe('Stimuli',function(){
        console.log("stimuli subscribe back");
        Tdfs.find({}).forEach(function(entry){
          if(tdfsInScopeForReporting.indexOf(entry.fileName) != -1 && hasLearningSessionItems(entry.fileName)){
            let displayName = entry.tdfs.tutor.setspec[0].lessonname[0];
            let fileName = entry.fileName;
            studentReportingTdfs.push({fileName,displayName});
          }
        });
  
        console.log("studentReportingTdfs: " + JSON.stringify(studentReportingTdfs));
        Session.set('studentReportingTdfs',studentReportingTdfs);
        selectOptionByDefaultAndUpdateCharts(studentReportingTdfs);
      })
    });
  });
}

selectOptionByDefaultAndUpdateCharts = function(tdfs){
  console.log("selectOptionByDefaultAndUpdateCharts");

   //Have to wait for DOM to update after studentReportingTdfs is set
   Tracker.afterFlush(function(){
     console.log("selectOptionByDefaultAndUpdateCharts, tdfs: " + JSON.stringify(tdfs));
     if(!!tdfs[0]){
      let instructorSelectedTdf = Session.get("instructorSelectedTdf");
      let tdfToSelect = instructorSelectedTdf || tdfs[0].fileName;
      $("#tdf-select").val(tdfToSelect);
      console.log("selectOptionByDefaultAndUpdateCharts: " + $("#tdf-select").val());
      if($("#tdf-select").val() != null){
        let selectedTdf = $("#tdf-select").val().replace(".","_");
        let curTdfFileName = $("#tdf-select").val();
        Session.set("curSelectedTdf",curTdfFileName);
        updateDataAndCharts(selectedTdf,curTdfFileName);
      }
     }
   });
}

Template.studentReporting.rendered = function(){
  Session.set("studentReportingTdfs",[]);
  Session.set("curStudentPerformance",{});

  window.onpopstate = function(event){
    console.log("window popstate student reporting");
    if(document.location.pathname == "/studentReporting" && Session.get("loginMode") === "southwest"){
      Router.go("/profileSouthwest");
    }else{
      Router.go("/profile");
    }
  }
  console.log("studentReporting rendered!!!");

  Tracker.afterFlush(function(thisTracker){
    console.log("afterFlush");
    // if(document.location.pathname != "/studentReporting"){
    //   console.log("navigated away from student reporting. stop tracker");
    //   thisTracker.stop();
    // }
    var user = Meteor.user();
    if(!!user){
      var studentUsername = "";
      var studentID = "";
      if (Roles.userIsInRole(Meteor.user(), ["admin","teacher"])){
        console.log("admin/teacher");
        studentUsername = Template.studentReporting.__helpers[" studentUsername"]();
        if(studentUsername.indexOf("@") == -1){
          studentUsername = studentUsername.toUpperCase();
        }
        Session.set("curStudentUsername",studentUsername);
        Meteor.subscribe("specificUser",studentUsername,function(){
          console.log("specificUser subscription done");
          var student = Meteor.users.findOne({"username":studentUsername});
          console.log("student: " + JSON.stringify(student));
          if(!!student){
            studentID = student._id;
          }
          Session.set("curStudentID",studentID);
          console.log("studentUsername:" + studentUsername);
          console.log("studentID:" + studentID);
          // Meteor.subscribe('specificUserTimesLog',studentID,function(){
          //   currentUserTimeLogs = UserTimesLog.findOne({_id:studentID});
          //   console.log("currentUserTimeLogs subscription done");
             setTdfFileNamesAndDisplayValues();
          // });
        });
      }else{
        studentUsername = Meteor.user().username;
        studentID = Meteor.userId();

        console.log("studentUsername:" + studentUsername);
        console.log("studentID:" + studentID);
        Session.set("curStudentUsername",studentUsername);
        Session.set("curStudentID",studentID);
        // Meteor.subscribe('specificUserTimesLog',studentID,function(){
        //   currentUserTimeLogs = UserTimesLog.findOne({_id:studentID});
        //   console.log("currentUserTimeLogs subscription done");
           setTdfFileNamesAndDisplayValues();
        // });
      }
    }else{
      console.log("no meteor user!!!");
    }
  });
};

Template.studentReporting.events({
  "change #tdf-select": function(event, template){
    console.log("change tdf select");
    let selectedTdf = $(event.currentTarget).val().replace(/[.]/g,"_");
    var curTdfFileName = $(event.currentTarget).val();
    Session.set("curSelectedTdf",curTdfFileName);
    updateDataAndCharts(selectedTdf,curTdfFileName);
  }
});

updateDataAndCharts = function(selectedTdf,curTdfFileName){
  console.log("updateDataAndCharts, curTdfFileName: " + curTdfFileName);
  var studentUsername = Session.get("curStudentUsername");
  // $("#correctnessChart").attr('data-x-axis-label','Repetition Number');
  // $("#correctnessChart").attr('data-y-axis-label','Correctness (%)');

  // $("#cardProbsChart").attr('data-x-axis-label','Correctness (%)');
  // if(selectedTdf === ALL_TDFS || !selectedTdf){
  //   console.log("updateDataAndCharts, setting currentStimName to null");
  //    //Session.set("currentStimName",null);
  //   // Session.set("currentTdfName",curTdfFileName);
  //   // Session.set("curTdfFileName",curTdfFileName);
  //   // $("#cardProbsChart").attr('data-y-axis-label',"Chapter");
  // }else{
  //   // $("#cardProbsChart").attr('data-y-axis-label',"");

  //   // Session.set("currentTdfName",curTdfFileName);
  //   // Session.set("curTdfFileName",curTdfFileName);
  //   // Session.set("currentRootTdfName",curTdfFileName);
  //   // checkIfNeedSubTdfName(getCurrentTdfFile()); //TODO: technically we need this for reporting experiments with conditions, fix later
  //   var curTdfFile = getCurrentTdfFile();
  //   if(!!curTdfFile){
  //     console.log("updateDataAndCharts, setting currentStimName to: " + curTdfFile.tdfs.tutor.setspec[0].stimulusfile[0]);
  //     Session.set("currentStimName",curTdfFile.tdfs.tutor.setspec[0].stimulusfile[0]);
  //   }else{
  //     //Gracefully handle case where a tdf has been deleted
  //     Session.set("curStudentPerformance",{
  //       "username":studentUsername,
  //       "count":"N/A",
  //       "percentCorrect":"N/A",
  //       "numCorrect":"N/A",
  //       "totalTime":"N/A"
  //     });
  //     //drawCharts(true,selectedTdf);
  //     return;
  //   }
  // }

  let studentID = Session.get("curStudentID");

  setStudentPerformance(studentID,studentUsername,curTdfFileName);

  //drawCharts(false,selectedTdf);
}

// checkIfNeedSubTdfName = function(rootTDF){
//   var setspec = rootTDF.tdfs.tutor.setspec[0];
//   var needExpCondition = (setspec.condition && setspec.condition.length);

//   var userTimesLog = getUserTimesLog(userTimesExpKey(true));

//   //We must always check for experiment condition
//   if (needExpCondition) {
//       console.log("Experimental condition is required: searching");
//       var prevCondition = _.find(userTimesLog, function(entry) {
//           return entry && entry.action && entry.action === "expcondition";
//       });

//       var subTdf = null;

//       if (prevCondition) {
//           //Use previous condition and log a notification that we did so
//           console.log("Found previous experimental condition: using that");
//           subTdf = prevCondition.selectedTdf;
//           conditionAction = "condition-notify";
//           conditionData.note = "Using previous condition: " + subTdf;
//       }
//       else {
//           //Select condition and save it
//           console.log("No previous experimental condition: Selecting from " + setspec.condition.length);
//           subTdf = _.sample(setspec.condition);
//       }

//       if (!subTdf) {
//           console.log("No experimental condition could be selected!");
//           return;
//       }

//       //Now we have a different current TDF (but root stays the same)
//       Session.set("currentTdfName", subTdf);
//   }
// }

// getUserTimesLog = function(expKey){
//   userLog = currentUserTimeLogs;

//   var entries = [];
//   if (userLog && userLog[expKey] && userLog[expKey].length) {
//       entries = JSON.parse(JSON.stringify(userLog[expKey]));
//   }else{
//     console.log("no entries");
//   }

//   var previousRecords = {};
//   var records = [];

//   for(var i = 0; i < entries.length; ++i) {
//       var rec = entries[i];

//       //Suppress duplicates like we do on the server side for file export
//       var uniqifier = rec.action + ':' + rec.clientSideTimeStamp;
//       if (uniqifier in previousRecords) {
//           continue; //dup detected
//       }
//       previousRecords[uniqifier] = true;

//       //We don't do much other than save the record
//       records.push(rec);
//   }

//   return records;
// }

// recreateEngineFinalState = function(){
//   console.log("recreateEngineFinalState");
//   checkIfNeedSubTdfName(getCurrentTdfFile());
//   let curStimFile = getCurrentStimName().replace(/\./g,'_');
//   console.log("recreateEngineFinalState, curStimFile: " + curStimFile);
//   cachedSyllables = StimSyllables.findOne({filename:curStimFile});
//   //console.log("cachedSyllables: " + JSON.stringify(cachedSyllables));
//   let expKey = Session.get("currentTdfName").replace(/[.]/g,'_');
//   let userTimesLog = getUserTimesLog(expKey);
//   setUpClusterMapping(userTimesLog);
//   tempModelUnitEngine = createModelUnit({cachedSyllables:cachedSyllables});
//   processUserTimesLogStudentReporting(tempModelUnitEngine,userTimesLog);
// }

// getTdfProbsAndLabels = function(){
//   console.log('getTdfProbsAndLabels');
//   //We've selected the "All" tdf option
//   if(Session.get("currentStimName") === null){
//     var allTdfProbs = [];
//     var allTdfProbLabels = [];
//     var studentReportingTdfs = Session.get("studentReportingTdfs");

//     for(var i=0;i<studentReportingTdfs.length;i++){
//       var curTdfFileName = studentReportingTdfs[i].fileName;
//       var curTdfDisplayName = studentReportingTdfs[i].displayName;
//       Session.set("currentTdfName",curTdfFileName);
//       Session.set("currentRootTdfName",curTdfFileName);
//       console.log("curTdfFileName: " + curTdfFileName);
//       if(!!getCurrentTdfFile() && !!getCurrentTdfFile().tdfs.tutor.setspec[0].stimulusfile){
//         Session.set("currentStimName",getCurrentTdfFile().tdfs.tutor.setspec[0].stimulusfile[0]);
        
//         recreateEngineFinalState();
//         let learningSessionItems = getLearningSessionItems(curTdfFileName);
//         let totalStimProb = 0;
//         let cardProbs = tempModelUnitEngine.getCardProbs();
//         let numProbs = 0;
//         for(let j=0;j<cardProbs.length;j++){
//           let cardIndex = cardProbs[j].cardIndex;
//           if(!!cardProbs[j].probability && (!!learningSessionItems[curTdfFileName] && !!learningSessionItems[curTdfFileName][cardIndex])){
//             totalStimProb += cardProbs[j].probability;
//             numProbs += 1;
//           }
//         }

//         if(numProbs > 0){
//           let avgStimProbForTdf = totalStimProb / numProbs;
//           allTdfProbLabels.push(curTdfDisplayName.replace(" ",'_'));
//           allTdfProbs.push(avgStimProbForTdf);
//         }
//       }
//     }
//     console.log("past studentReportingTdfs loop, setting stim and tdf to null");
//     Session.set("currentStimName",null);
//     Session.set("currentTdfName",null);
//     return [allTdfProbLabels,allTdfProbs];
//   }else{
//     recreateEngineFinalState();

//     let curTdfFileName = Session.get("currentTdfName");
//     let learningSessionItems = getLearningSessionItems(curTdfFileName);
//     let cardProbs = [];
//     let cardProbsLabels = [];
//     let mycardProbs =tempModelUnitEngine.getCardProbs();
//     for(let i=0;i<mycardProbs.length;i++){
//       let cardIndex = mycardProbs[i].cardIndex;
//       if(!!learningSessionItems[curTdfFileName] && !!learningSessionItems[curTdfFileName][cardIndex]){
//         let stimIndex = mycardProbs[i].stimIndex;
//         let currentDisplay = fastGetStimDisplay(cardIndex,stimIndex);
//         let currentQuestion = currentDisplay.text || currentDisplay.clozeText || currentDisplay.imgSrc || currentDisplay.audioSrc || currentDisplay.videoSrc;
//         if(mycardProbs[i].probFunctionsParameters.stimOutcomeHistory && mycardProbs[i].probFunctionsParameters.stimOutcomeHistory.length > 0){
//           console.log("pushing card prob!!!" + JSON.stringify(mycardProbs[i]) + ", " + i);
//           cardProbsLabels.push(currentQuestion);
//           cardProbs.push(mycardProbs[i].probability);
//         }
//       }
//     }

//     return [cardProbsLabels,cardProbs];
//   }
// }

// setUpClusterMapping = function(userTimesLog){
//   console.log("setUpClusterMapping");
//   var clusterMapping = _.find(userTimesLog, function(entry) {
//     return entry && entry.action && entry.action === "cluster-mapping";
//   });
//   if (!clusterMapping) {
//       //do nothing, we shouldn't create data when we're trying to view it
//   }
//   else {
//       //Found the cluster mapping record - extract the embedded mapping
//       clusterMapping = clusterMapping.clusterMapping;
//       console.log("Cluster mapping found", clusterMapping);
//   }

//   if (!clusterMapping || !clusterMapping.length || clusterMapping.length !== getStimClusterCount()) {
//       console.log("Invalid cluster mapping", getStimClusterCount(), clusterMapping);
//       throw "The cluster mapping is invalid - can not continue";
//   }

//   //Go ahead and save the cluster mapping we found/created
//   Session.set("clusterMapping", clusterMapping);
// }

// getAvgCorrectnessAcrossKCsLearningCurve = function(selectedTdf){
//   console.log("getAvgCorrectnessAcrossKCsLearningCurve");
//   var avgCorrectnessAcrossKCsLearningCurve = [];

//   countAndNumCorrectPerTrialNum = {};

//   for(var i=0;i<numTrialsForKCLearningCurve;i++){
//     countAndNumCorrectPerTrialNum[i] = {"count":0,"numCorrect":0};
//   }

//   tdfQueryNames = [];

//   if(selectedTdf == ALL_TDFS){
//     //NOTE: this line is dependent on timing, specifically the page should have been mostly set up before we get to here
//     var allTdfsAttempted = Session.get("studentReportingTdfs");
//     _.each(allTdfsAttempted,function(tdf){
//       tdfQueryNames.push(tdf.fileName);
//     });
//   }else{
//     tdfQueryNames.push(selectedTdf);
//   }

//   _.each(tdfQueryNames,function(tdfQueryName){
//     var curStim = undefined;
//     var curCluster = undefined;
//     allAnswerAttempts = {};
//     var expKey = tdfQueryName.replace(/[.]/g,"_");
//     var curQuestionIsAssessment = false;
//     _.each(getUserTimesLog(expKey), function(entry, index, currentList) {
//       if (!entry.action) {
//           console.log("Ignoring user times entry with no action");
//           return;
//       }

//       //Only examine the messages that we care about
//       var action = _.trim(entry.action).toLowerCase();

//       if (action === "question") {
//         curQuestionIsAssessment = entry.selType === "schedule";
//         curStim = entry.whichStim;
//         curCluster = entry.clusterIndex;
//       }else if(action === "answer" || action === "[timeout]"){
//         if(curQuestionIsAssessment){
//           console.log("found an assessment question, skipping");
//           return;
//         }
//         var wasCorrect;
//         if (action === "answer") {
//             wasCorrect = typeof entry.isCorrect !== "undefined" ? entry.isCorrect : null;
//             if (wasCorrect === null) {
//                 console.log("Missing isCorrect on an answer - assuming false", entry);
//                 wasCorrect = false;
//             }
//         }
//         else {
//             wasCorrect = false; //timeout is never correct
//         }

//         if(!allAnswerAttempts[curCluster]){
//           allAnswerAttempts[curCluster] = {};
//         }
//         if(!allAnswerAttempts[curCluster][curStim]){
//           allAnswerAttempts[curCluster][curStim] = [];
//         }

//         allAnswerAttempts[curCluster][curStim].push(wasCorrect);

//         curStim = undefined;
//         curCluster = undefined;
//       }
//     });

//     _.each(_.keys(allAnswerAttempts),function(curCluster){
//       _.each(_.keys(allAnswerAttempts[curCluster]),function(curStim){
//           var curAnswerArray = allAnswerAttempts[curCluster][curStim];
//           for(var i=0;i<curAnswerArray.length && i < numTrialsForKCLearningCurve;i++){
//             var curAnswer = curAnswerArray[i];
//             countAndNumCorrectPerTrialNum[i].count += 1;
//             if(curAnswer){
//               countAndNumCorrectPerTrialNum[i].numCorrect += 1;
//             }
//           }
//       });
//     });
//   });

//   for(var i=0;i<numTrialsForKCLearningCurve;i++){
//     var count = countAndNumCorrectPerTrialNum[i].count;
//     var numCorrect = countAndNumCorrectPerTrialNum[i].numCorrect;
//     if(count > 0){
//       var avg = numCorrect / count;
//       avgCorrectnessAcrossKCsLearningCurve.push(avg);
//     }
//   }

//   return avgCorrectnessAcrossKCsLearningCurve;
// }

// safeSeries = function(series) {
//     if (!series || series.length < 1)
//         return series;
//     return series;
// }

// var drawCorrectnessLine = function(targetSelector, labels, series, dataDescrip, chartConfig) {
//     var target = $(targetSelector).get(0);
//     if (!target) {
//         console.log("no target");
//         return;
//     }
//     if (series.length < 2) {
//         $(target)
//             .removeClass("show-axis-labels")
//             .html("<div class='nodata'>No " + dataDescrip + " data available</div>");
//     }
//     else {
//         $(target).addClass("show-axis-labels").html("");;
//         // Note that we provide some default values that can be overridden
//         var chartData = {
//             'labels': labels,
//             'series': [series]
//         };

//         var fullConfig = _.extend({
//             low: 0,
//             fullWidth: true,
//             height: 300,
//             lineSmooth: false
//         }, chartConfig);

//         new Chartist.Line(target, chartData, fullConfig);
//     }
// };

// var drawProbBars = function(targetSelector, labels, series, dataDescrip, chartConfig) {
//     var target = $(targetSelector).get(0);
//     if (!target) {
//         return;
//     }
//     if (series.length < 1) {
//         $(target)
//             .removeClass("show-axis-labels")
//             .html("<div class='nodata'>No " + dataDescrip + " data available</div>");
//     }
//     else {
//         $(target).addClass("show-axis-labels").html("");
//         // Note that we provide some default values that can be overridden
//         var chartData = {
//             'labels': labels,
//             'series': [series]
//         };

//         lookUpLabelByDataValue = function(value){
//           return labels[series.findIndex(function(element){
//             return element == value;
//           })];
//         }

//         var fullConfig = _.extend({
//             low: 0,
//             fullWidth: true,
//         }, chartConfig);

//         new Chartist.Bar(target, chartData, fullConfig).on("draw", function(data) {
//           if (data.type === "bar") {
//         		data.element._node.setAttribute("title", "Item: " + lookUpLabelByDataValue(data.value) + " Value: " + data.value.toFixed(2));
//         		data.element._node.setAttribute("data-chart-tooltip", target);
//         	}
//         }).on("created", function() {
//         	// Initiate Tooltip
//         	$(target).tooltip({
//         		selector: '[data-chart-tooltip="'+target+'"]',
//         		container: target,
//         		html: true
//         	});
//         });
//     }
// }

// drawCharts = function (drawWithoutData,selectedTdf) {
//     if(!!drawWithoutData){
//       drawCorrectnessLine('#correctnessChart', [], [], "repetition", {});

//       drawProbBars('#cardProbsChart', [], [], "probabilities", {});
//     }else{
//       // Get our series and populate a range array for chart labeling
//       var correctSeries = safeSeries(getAvgCorrectnessAcrossKCsLearningCurve(selectedTdf));
//       correctSeries = correctSeries.map(function(val){return val*100});
//       var rawProbs = getTdfProbsAndLabels();
//       probSeries = safeSeries(rawProbs[1]);
//       probSeries = probSeries.map(function(val){return val*100}).reverse();

//       var itemDataCorLabels = _.range(1, correctSeries.length+1);  // from 1 to len
//       var itemDataProbLabels = rawProbs[0].reverse();
//       var cardProbsChartAxisYOffset;

//       //"All" selected, so we should make room for labels bigger than just numbers
//       if(Session.get("curSelectedTdf") === ALL_TDFS){
//           cardProbsChartAxisYOffset = 250;
//           showYAxisLabel = true
//       }else{
//           cardProbsChartAxisYOffset = 50;
//           showYAxisLabel = false;//
//       }
//       probBarsHeight = Math.max((probSeries.length * 10),200);

//       // Now actually create the charts - but only if we can find the proper
//       // elements and there is data to display


//       drawCorrectnessLine('#correctnessChart', itemDataCorLabels, correctSeries, "repetition", {
//           height: 300,
//           axisY: {
//               type: Chartist.FixedScaleAxis,
//               ticks: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
//               low: 0,
//               high: 100
//           }
//       });

//       drawProbBars('#cardProbsChart', itemDataProbLabels, probSeries, "probabilities", {
//         seriesBarDistance: 0,
//         height: probBarsHeight,
//         horizontalBars: true,
//         high: 100,
//         axisX:{
//           labelInterpolationFnc: function(value, index) {
//             return value % 10 == 0 ? value : null;
//           },
//           position: 'start',
//           onlyInteger: true,
//           type: Chartist.AutoScaleAxis,
//           scaleMinSpace: 10,
//           low: 0,
//         },
//         axisY:{
//           offset: cardProbsChartAxisYOffset,
//           showLabel: showYAxisLabel
//         }
//       });
//     }

// };

// function recordProgress(question, answer, userAnswer, isCorrect) {
//     var uid = Meteor.userId();
//     if (!uid) {
//         console.log("NO USER ID!!!");
//         return;
//     }

//     var questionIndex = Session.get("questionIndex");
//     if (!questionIndex && questionIndex !== 0) {
//         questionIndex = null;
//     }

//     // //Don't count assessment session trials as part of user progress
//     // if(Session.get("sessionType") === "assessmentsession"){
//     //   return;
//     // }

//     var prog = getUserProgress();
//     prog.progressDataArray.push({
//         clusterIndex: getCurrentClusterIndex(),
//         questionIndex: questionIndex,
//         question: question,
//         answer: answer,
//         userAnswer: userAnswer,
//         isCorrect: isCorrect,
//     });

//     //This is called from processUserTimesLog() so this both works in memory and restoring from userTimesLog
//     //Ignore instruction type questions for overallOutcomeHistory
//     if(getTestType() !== "i"){
//       prog.overallOutcomeHistory.push(isCorrect ? 1 : 0);
//     }
// }

// processUserTimesLogStudentReporting = function(tempEngine,userTimesLogs) {
//     var engine = tempEngine;
//     //Get TDF info
//     var file = getCurrentTdfFile();
//     var tutor = file.tdfs.tutor;
  

//     //Before the below options, reset current test data
//     initUserProgress({
//         overallOutcomeHistory: [],
//         progressDataArray: [],
//         currentSchedule: {}
//     });

//     //Default to first unit
//     Session.set("currentUnitNumber", 0);
//     Session.set("currentUnitStartTime", Date.now());

//     //We'll be tracking the last question so that we can match with the answer
//     var lastQuestionEntry = null;

//     //prepareCard will handle whether or not new units see instructions, but
//     //it will miss instructions for the very first unit.
//     var needFirstUnitInstructions = tutor.unit && tutor.unit.length;

//     //Helper to determine if a unit specified by index has the given field
//     var unitHasOption = function(unitIdx, optionName) {
//         var unitSection = _.chain(file.tdfs.tutor)
//             .prop("unit").prop(unitIdx)
//             .prop(optionName).first().value();
//         console.log("UNIT CHECK", unitIdx, optionName, !!unitSection);
//         return !!unitSection;
//     };

//     //It's possible that they clicked Continue on a final unit, so we need to
//     //know to act as if we're done
//     var moduleCompleted = false;

//     //Reset current engine
//     var resetEngine = function(currUnit) {
//       let extensionData = {
//         cachedSyllables: cachedSyllables
//       }

//       if (unitHasOption(currUnit, "assessmentsession")) {
//           engine = createScheduleUnit(extensionData);
//           Session.set("sessionType","assessmentsession");
//       }
//       else if (unitHasOption(currUnit, "learningsession")) {
//           engine = createModelUnit(extensionData);
//           Session.set("sessionType","learningsession");
//       }
//       else {
//           engine = createEmptyUnit(extensionData); //used for instructional units
//           Session.set("sessionType","empty");
//       }
//   };

//     //The last unit we captured start time for - this way we always get the
//     //earliest time for our unit start
//     var startTimeMinUnit = -1;

//     //At this point, our state is set as if they just started this learning
//     //session for the first time. We need to loop thru the user times log
//     //entries and update that state

//     _.each(userTimesLogs, function(entry, index, currentList) {
//         // IMPORTANT: this won't really work since we're in a tight loop. If we really
//         // want to get this to work, we would need asynch loop processing (see
//         // http://stackoverflow.com/questions/9772400/javascript-async-loop-processing
//         // if you're unfamiliar). As a result, we just have a loading message
//         // IMPORTANT: remember that you will need to integrate with
//         // Meteor's handling of the event loop (so base your async loop on
//         // Meteor.setTimeout or something)
//         // var progress = (index + 1.0) / currentList.length;
//         // progress = _.intval(progress * 100);
//         // $('#resumeMsg').text(progress + "% Complete");
//         // $('.progress-bar').css('width', progress+'%').attr('aria-valuenow', progress);

//         if (!entry.action) {
//             console.log("Ignoring user times entry with no action");
//             return;
//         }

//         //Only examine the messages that we care about
//         var action = _.trim(entry.action).toLowerCase();

//         //Generally we use the last timestamp for our major actions. This will
//         //currently only be set to false in the default/fall-thru else block
//         var recordTimestamp = true;

//         if (action === "instructions") {
//             //They've been shown instructions for this unit
//             needFirstUnitInstructions = false;
//             var instructUnit = entry.currentUnit;
//             if (!!instructUnit || instructUnit === 0) {
//                 Session.set("currentUnitNumber", instructUnit);
//                 Session.set("questionIndex", 0);
//                 Session.set("clusterIndex", undefined);
//                 Session.set("currentDisplay", undefined);
//                 Session.set("originalDisplay", undefined);
//                 Session.set("currentQuestionPart2",undefined);
//                 Session.set("currentAnswer", undefined);
//                 Session.set("testType", undefined);

//                 resetEngine(instructUnit);
//             }
//         }

//         else if (action === "unit-end") {
//             //Logged completion of unit - if this is the final unit we also
//             //know that the TDF is completed
//             var finishedUnit = _.intval(entry.currentUnit, -1);
//             var checkUnit = _.intval(Session.get("currentUnitNumber"), -2);
//             if (finishedUnit >= 0 && checkUnit === finishedUnit) {
//                 //Correctly matches current unit - reset
//                 needFirstUnitInstructions = false;
//                 lastQuestionEntry = null;

//                 Session.set("questionIndex", 0);
//                 Session.set("clusterIndex", undefined);
//                 Session.set("currentDisplay", undefined);
//                 Session.set("originalDisplay", undefined);
//                 Session.set("currentQuestionPart2",undefined);
//                 Session.set("currentAnswer", undefined);
//                 Session.set("testType", undefined);

//                 if (finishedUnit === file.tdfs.tutor.unit.length - 1) {
//                     //Completed
//                     moduleCompleted = true;
//                 }
//                 else {
//                     //Moving to next unit
//                     checkUnit += 1;
//                     Session.set("currentUnitNumber", checkUnit);
//                     resetEngine(checkUnit);
//                 }
//             }
//         }

//         else if (action === "turk-approval" || action === "turk-bonus") {
//             //Currently just walk on by (but we don't log an "ignored this" msg)
//         }

//         else if (action === "schedule") {
//             //Read in the previously created schedule
//             lastQuestionEntry = null; //Kills the last question
//             needFirstUnitInstructions = false;

//             var unit = entry.unitindex;
//             if (!unit && unit !== 0) {
//                 //If we don't know the unit, then we can't proceed
//                 console.log("Schedule Entry is missing unitindex", unit);
//                 return;
//             }

//             var setSpec = file.tdfs.tutor.setspec[0];
//             var currUnit = file.tdfs.tutor.unit[unit];
//             var schedule = entry.schedule;

//             if (!schedule) {
//                 //There was an error creating the schedule - there's really nothing
//                 //left to do since the experiment is broken
//                 recordUserTime("FAILURE to read schedule from user time log", {
//                     unitname: _.display(currUnit.unitname),
//                     unitindex: unit
//                 });
//                 alert("There is an issue with either the TDF or the Stimulus file - experiment cannot continue");
//                 clearCardTimeout();
//                 leavePage("/profile");
//                 return;
//             }

//             //Update what we know about the session
//             //Note that the schedule unit engine will see and use this
//             getUserProgress().currentSchedule = schedule;
//             Session.set("currentUnitNumber", unit);
//             Session.set("questionIndex", 0);

//             //Blank out things that should restart with a schedule
//             Session.set("clusterIndex", undefined);
//             Session.set("currentDisplay", undefined);
//             Session.set("originalDisplay", undefined);
//             Session.set("currentQuestionPart2",undefined);
//             Session.set("currentAnswer", undefined);
//             Session.set("testType", undefined);
//         }

//         else if (action === "question") {
//             //Read in previously asked question
//             lastQuestionEntry = entry; //Always save the last question
//             needFirstUnitInstructions = false;

//             if (!entry.selType) {
//                 console.log("Ignoring user times entry question with no selType", entry);
//                 return;
//             }

//             //Restore the session variables we save with each question
//             //REMEMBER - the logged card had its mapped index logged as
//             //clusterIndex, but we use the UN-mapped index right up until we
//             //send the log or access a stimulus cluster. Luckily the unmapped
//             //index should have been logged as shufIndex. Note that if there
//             //isn't a shufIndex, we just use the clusterIndex
//             var cardIndex = entry.shufIndex || entry.clusterIndex;

//             Session.set("clusterIndex",         cardIndex);
//             Session.set("questionIndex",        entry.questionIndex);
//             Session.set("currentUnitNumber",    entry.currentUnit);
//             Session.set("currentDisplay",       entry.selectedDisplay);
//             Session.set("currentQuestionPart2", entry.selectedQuestionPart2);
//             Session.set("currentAnswer",        entry.selectedAnswer);
//             Session.set("currentAnswerSyllables", entry.currentAnswerSyllables);
//             Session.set("clozeQuestionParts",     entry.clozeQuestionParts);
//             Session.set("showOverlearningText",   entry.showOverlearningText);
//             Session.set("originalDisplay",      entry.originalSelectedDisplay);
//             Session.set("testType",             entry.testType);
//             Session.set("originalAnswer", entry.originalAnswer);
//             Session.set("originalQuestion",entry.originalQuestion);

//             // Notify the current engine about the card selection (and note that
//             // the engine knows that this is a resume because we're passing the
//             // log entry back to it). The entry should include the original
//             // selection value to pass in, but if it doesn't we default to
//             // cardIndex (which should work for all units except the model)
//             engine.cardSelected(entry.selectVal || cardIndex, entry);
//         }

//         else if (action === "answer" || action === "[timeout]") {
//             //Read in the previously recorded answer (even if it was a timeout)
//             needCurrentInstruction = false; //Answer means they got past the instructions
//             needFirstUnitInstructions = false;
//             if (lastQuestionEntry === null) {
//                 console.log("Ignore answer for no question", entry);
//                 return;
//             }

//             //Did they get it right or wrong?
//             var wasCorrect;
//             if (action === "answer") {
//                 wasCorrect = typeof entry.isCorrect !== "undefined" ? entry.isCorrect : null;
//                 if (wasCorrect === null) {
//                     console.log("Missing isCorrect on an answer - assuming false", entry);
//                     wasCorrect = false;
//                 }
//             }
//             else {
//                 wasCorrect = false; //timeout is never correct
//             }

//             //Test type is always recorded with an answer, so we just reset it
//             var testType = entry.ttype;
//             Session.set("testType", testType);

//             //The session variables should be set up correctly from the question
//             recordProgress(
//                 Session.get("currentDisplay"),
//                 Session.get("currentAnswer"),
//                 entry.answer,
//                 wasCorrect
//             );

//             var simCorrect = null;
//             if (_.chain(entry).prop("wasSim").intval() > 0) {
//                 simCorrect = wasCorrect;
//             }

//             //Notify unit engine about card answer
//             engine.cardAnswered(wasCorrect, entry);

//             //We know the last question no longer applies
//             lastQuestionEntry = null;
//         }

//         else {
//             recordTimestamp = false; //Don't use the timestamp for this one
//             //console.log("Ignoring user times log entry with action", action);
//         }

//         if (recordTimestamp && entry.clientSideTimeStamp) {
//             Session.set("lastTimestamp", entry.clientSideTimeStamp);

//             if (Session.get("currentUnitNumber") > startTimeMinUnit) {
//                 Session.set("currentUnitStartTime", Session.get("lastTimestamp"));
//                 startTimeMinUnit = Session.get("currentUnitNumber");
//             }
//         }
//     });
// }
