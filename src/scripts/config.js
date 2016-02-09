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

		        responseType: "arraybuffer"}).             
		        success(function(data, status, headers, config) {  
		            saveAs(new Blob([data],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}), "excel111.xlsx");
		        }).error(function(data, status, headers, config) {
		        	
				});  
			}

		};
	})