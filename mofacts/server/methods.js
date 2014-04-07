var Future = Npm.require("fibers/future");
var fs = Npm.require("fs");
var filename, name, timestamp, TempLog = "";
var filepath = '../../../../../server/';
var endOfLine = Npm.require("os").EOL;

Meteor.startup(function () {
	Stimuli.remove({});
	Tdfs.remove({});
	stimTdfPair.remove({});
	var files = fs.readdirSync('./assets/app/stims/');
	var tdffiles = fs.readdirSync('./assets/app/tdf/');
	console.log(tdffiles);
	console.log(files);
	var stims = _(files).reject( function(fileName) {
		return fileName.indexOf('.xml') < 0;
	});
	var tdfs = _(tdffiles).reject( function(fileName) {
		return fileName.indexOf('.xml') < 0;
	});

	for(var i = 0; i < stims.length; i++){
		var fileName = stims[i];
		var json = getStimJSON('stims/' + fileName);
		Stimuli.insert({fileName: fileName, stimuli: json});
		
	}
	
	for(var i = 0; i < tdfs.length; i++){
		var fileName = tdfs[i];
		var json = getStimJSON('tdf/' + fileName);
		Tdfs.insert({fileName: fileName, tdfs: json});
		
	}
		Meteor.methods({

		//Added addition stuff to Log
		writing: function(stuff){
			fs.appendFileSync(filepath + name + "_" + filename +".txt", stuff)
			Meteor.call("addtime");
		},
	
		//Added addition stuff to Log
		addtime: function(){
			Meteor.call("timestamp");
			fs.appendFileSync(filepath + name + "_" + filename +".txt", timestamp  + endOfLine)
		},

		//Saves test name to Server side
		naming: function(name){
			name = name.split(".",1);
			filename = name;
		},

		//Saves username to Server side
		user: function(names){
			name = names;

		},

		//Saves timestamp to Server side
		timestamp: function(){
			var time = Date.now();
			timestamp = time;
		},

		//Saves timestamp to Server side
		Userlog: function(usernamestuff){
			console.log(usernamestuff + " has connected.")
		}
	});

	buildSchedule();
});

function getStimJSON(fileName) {
	var future = new Future();
	Assets.getText(fileName, function(err, data){
		if (err) throw err;
		var json = XML2JS.parse(data);
		future.return(json);
	});
	return future.wait();
}


function buildSchedule() {
        	
}

