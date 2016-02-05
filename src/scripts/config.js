angular
	.module('scraper', [ 'ui.router', 'angularFileUpload'])

	.config(function($stateProvider) {
	  	$stateProvider
		    .state('index', {
		      url: "",
      		  templateUrl: "./assets/landing.html",
      		  controller: "main",
      		  controllerAs: "main"
		    })
	});