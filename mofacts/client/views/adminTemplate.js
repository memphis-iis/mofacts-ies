Template.adminTemplate.rendered = function() {
};

Template.adminTemplate.helpers({
   results: function() {
       return Meteor.user();  //TODO: everything (anything) in this template
   }
});
