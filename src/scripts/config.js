angular
	.module('scraper', [ 'ui.router', 'angularFileUpload', 'ngSanitize', 'ngCsv'])

	.config(function($stateProvider, $urlRouterProvider) {

		// $urlRouterProvider.when('', 'home');
		// $urlRouterProvider.otherwise('/home')

	  	$stateProvider
		    .state('index', {
		      url: "/home",
      		  templateUrl: "./assets/landing.html"
		    })
		    .state('tnt', {
		      url: "/tnt",
		      templateUrl: './assets/radio.html',
		      abstract: true
		    })
		    .state('tnt.view', {
		    	url: '/other',
				views: {
					'tnt': {
						templateUrl: './assets/tnt.html',
						controller: 'tnt',
						controllerAs: 'tnt'
					},
					'tntlast': {
						templateUrl: './assets/tntlast.html',
						controller: 'tntlast',
						controllerAs: 'tntlast'
					}
				}
		    })
		    .state('startrack', {
		      url: "/startrack",
      		  templateUrl: "./assets/startrack.html",
      		  controller: "startrack",
      		  controllerAs: "startrack"
		    })
	})

	.factory('Add', function ($http, $location, $rootScope) {
		return {

			ship: function shipFile(data) {
				console.log('DATA COMING IN');
				console.log(data);
				return $http.post('/api/load', data).success(function (data) {
					console.log('DATA FIRED OUT');
					console.log(data);
				}).error(function (err) {
					console.info('error', err)
				});
			},
			exportExcel: function () {
				$http({method: 'GET', url: "/api/export",
				headers: {'Content-Type': "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"},
		        responseType: "arraybuffer"}).             
		        success(function(data, status, headers, config) {  
		            saveAs(new Blob([data],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}), "excel111.xlsx");
		        }).error(function(data, status, headers, config) {

				});  
			}

		};
	})

