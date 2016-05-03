////////////////////////////////////////////////////////////////////////////
// Template storage and helpers

Template.allStudents.helpers({
    username: function () {
        if (!haveMeteorUser()) {
            routeToSignin();
        }
        else {
            return Meteor.user().username;
        }
    }
});


////////////////////////////////////////////////////////////////////////////
// Template Events

Template.allStudents.events({
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


    'click .adminLink' : function (event) {
        event.preventDefault();
        Router.go("/admin");
    },

    'click .studentButton' : function (event) {
				var target = $(event.currentTarget);
				Session.set('currStudent', target.data("studentkey"));
				Session.set('currUsername', target.data("usernameKey"));
        event.preventDefault();      
        Router.go('/student');  
    }
});

Template.allStudents.rendered = function () {

		// We have to build the query as a JavaScript object to get only the users that have done questions on this test.
		var userQuery = {};
		var tdfDBName = buildTdfDBName(getCurrentTdfName());
		userQuery[tdfDBName] = {$exists: true};
    var currTdfUsers = UserMetrics.find(userQuery);
		//
    var addButton = function(btnObj) {
        $("#studentButtonContainer").append(
            $("<div class='col-sm-3 col-md-3 col-lg-3 text-center'><br></div>").prepend(
                btnObj
            )
        );
    };

    currTdfUsers.forEach( function (user) {
				// Fetch the username from the main database and associate it with our smaller listing here.
				user.username = Meteor.users.findOne({_id: user._id}, {username: true}).username;
				
				// Compute the user's average score across this system to appear on the button (and to color it).
				user.score = computeUserScore(user, tdfDBName);
				
				// For convenience only, we assign the index to a variable so the code down below is less messy.
				var buttonColor = determineButtonColor(user.score);

        addButton(
            $("<button type='button' id='"+user._id+"' name='"+user._id+"'></button>")
                .addClass("btn btn-block studentButton")
                .data("studentkey", user._id)
                .data("usernameKey", user.username)
                .css("background", buttonColor)
                .html(user.username+", "+Math.floor((100*user.score))+"%")
        );
    });
};
