'use strict';

angular.module('scraper', ['ui.router', 'angularFileUpload']).config(function ($stateProvider) {
	$stateProvider.state('index', {
		url: "",
		templateUrl: "./assets/landing.html",
		controller: "main",
		controllerAs: "main"
	});
}).factory('Add', function ($http, $location, $rootScope) {
	return {

		ship: function shipFile(data) {
			console.log('DATA COMING IN');
			console.log(data);
			return $http.post('/api/load', data).success(function (data) {
				console.log('DATA FIRED OUT');
				console.log(data);
			}).error(function (err) {
				console.info('error', err);
			});
		},
		exportExcel: function exportExcel() {
			$http({ method: 'GET', url: "/api/export",

				responseType: "arraybuffer" }).success(function (data, status, headers, config) {
				saveAs(new Blob([data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "excel111.xlsx");
			}).error(function (data, status, headers, config) {});
		}

	};
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9zY3JpcHRzL2NvbmZpZy5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBLE9BQU8sQ0FDTCxNQUFNLENBQUMsU0FBUyxFQUFFLENBQUUsV0FBVyxFQUFFLG1CQUFtQixDQUFDLENBQUMsQ0FFdEQsTUFBTSxDQUFDLFVBQVMsY0FBYyxFQUFFO0FBQzlCLGVBQWMsQ0FDWCxLQUFLLENBQUMsT0FBTyxFQUFFO0FBQ2QsS0FBRyxFQUFFLEVBQUU7QUFDTCxhQUFXLEVBQUUsdUJBQXVCO0FBQ3BDLFlBQVUsRUFBRSxNQUFNO0FBQ2xCLGNBQVksRUFBRSxNQUFNO0VBQ3ZCLENBQUMsQ0FBQTtDQUNOLENBQUMsQ0FFRCxPQUFPLENBQUMsS0FBSyxFQUFFLFVBQVUsS0FBSyxFQUFFLFNBQVMsRUFBRSxVQUFVLEVBQUU7QUFDdkQsUUFBTzs7QUFFTixNQUFJLEVBQUUsU0FBUyxRQUFRLENBQUMsSUFBSSxFQUFFO0FBQzdCLFVBQU8sQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztBQUM5QixVQUFPLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQ2xCLFVBQU8sS0FBSyxDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUUsSUFBSSxDQUFDLENBQUMsT0FBTyxDQUFDLFVBQVUsSUFBSSxFQUFFO0FBQzVELFdBQU8sQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztBQUM5QixXQUFPLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ2xCLENBQUMsQ0FBQyxLQUFLLENBQUMsVUFBVSxHQUFHLEVBQUU7QUFDdkIsV0FBTyxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsR0FBRyxDQUFDLENBQUE7SUFDMUIsQ0FBQyxDQUFDO0dBQ0g7QUFDRCxhQUFXLEVBQUUsdUJBQVk7QUFDeEIsUUFBSyxDQUFDLEVBQUMsTUFBTSxFQUFFLEtBQUssRUFBRSxHQUFHLEVBQUUsYUFBYTs7QUFFbEMsZ0JBQVksRUFBRSxhQUFhLEVBQUMsQ0FBQyxDQUM3QixPQUFPLENBQUMsVUFBUyxJQUFJLEVBQUUsTUFBTSxFQUFFLE9BQU8sRUFBRSxNQUFNLEVBQUU7QUFDNUMsVUFBTSxDQUFDLElBQUksSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUMsRUFBQyxJQUFJLEVBQUMsbUVBQW1FLEVBQUMsQ0FBQyxFQUFFLGVBQWUsQ0FBQyxDQUFDO0lBQ3hILENBQUMsQ0FBQyxLQUFLLENBQUMsVUFBUyxJQUFJLEVBQUUsTUFBTSxFQUFFLE9BQU8sRUFBRSxNQUFNLEVBQUUsRUFFdEQsQ0FBQyxDQUFDO0dBQ0g7O0VBRUQsQ0FBQztDQUNGLENBQUMsQ0FBQSIsImZpbGUiOiJjb25maWcuanMiLCJzb3VyY2VzQ29udGVudCI6WyJhbmd1bGFyXG5cdC5tb2R1bGUoJ3NjcmFwZXInLCBbICd1aS5yb3V0ZXInLCAnYW5ndWxhckZpbGVVcGxvYWQnXSlcblxuXHQuY29uZmlnKGZ1bmN0aW9uKCRzdGF0ZVByb3ZpZGVyKSB7XG5cdCAgXHQkc3RhdGVQcm92aWRlclxuXHRcdCAgICAuc3RhdGUoJ2luZGV4Jywge1xuXHRcdCAgICAgIHVybDogXCJcIixcbiAgICAgIFx0XHQgIHRlbXBsYXRlVXJsOiBcIi4vYXNzZXRzL2xhbmRpbmcuaHRtbFwiLFxuICAgICAgXHRcdCAgY29udHJvbGxlcjogXCJtYWluXCIsXG4gICAgICBcdFx0ICBjb250cm9sbGVyQXM6IFwibWFpblwiXG5cdFx0ICAgIH0pXG5cdH0pXG5cblx0LmZhY3RvcnkoJ0FkZCcsIGZ1bmN0aW9uICgkaHR0cCwgJGxvY2F0aW9uLCAkcm9vdFNjb3BlKSB7XG5cdFx0cmV0dXJuIHtcblxuXHRcdFx0c2hpcDogZnVuY3Rpb24gc2hpcEZpbGUoZGF0YSkge1xuXHRcdFx0XHRjb25zb2xlLmxvZygnREFUQSBDT01JTkcgSU4nKTtcblx0XHRcdFx0Y29uc29sZS5sb2coZGF0YSk7XG5cdFx0XHRcdHJldHVybiAkaHR0cC5wb3N0KCcvYXBpL2xvYWQnLCBkYXRhKS5zdWNjZXNzKGZ1bmN0aW9uIChkYXRhKSB7XG5cdFx0XHRcdFx0Y29uc29sZS5sb2coJ0RBVEEgRklSRUQgT1VUJyk7XG5cdFx0XHRcdFx0Y29uc29sZS5sb2coZGF0YSk7XG5cdFx0XHRcdH0pLmVycm9yKGZ1bmN0aW9uIChlcnIpIHtcblx0XHRcdFx0XHRjb25zb2xlLmluZm8oJ2Vycm9yJywgZXJyKVxuXHRcdFx0XHR9KTtcblx0XHRcdH0sXG5cdFx0XHRleHBvcnRFeGNlbDogZnVuY3Rpb24gKCkge1xuXHRcdFx0XHQkaHR0cCh7bWV0aG9kOiAnR0VUJywgdXJsOiBcIi9hcGkvZXhwb3J0XCIsXG5cblx0XHQgICAgICAgIHJlc3BvbnNlVHlwZTogXCJhcnJheWJ1ZmZlclwifSkuICAgICAgICAgICAgIFxuXHRcdCAgICAgICAgc3VjY2VzcyhmdW5jdGlvbihkYXRhLCBzdGF0dXMsIGhlYWRlcnMsIGNvbmZpZykgeyAgXG5cdFx0ICAgICAgICAgICAgc2F2ZUFzKG5ldyBCbG9iKFtkYXRhXSx7dHlwZTpcImFwcGxpY2F0aW9uL3ZuZC5vcGVueG1sZm9ybWF0cy1vZmZpY2Vkb2N1bWVudC5zcHJlYWRzaGVldG1sLnNoZWV0XCJ9KSwgXCJleGNlbDExMS54bHN4XCIpO1xuXHRcdCAgICAgICAgfSkuZXJyb3IoZnVuY3Rpb24oZGF0YSwgc3RhdHVzLCBoZWFkZXJzLCBjb25maWcpIHtcblx0XHQgICAgICAgIFx0XG5cdFx0XHRcdH0pOyAgXG5cdFx0XHR9XG5cblx0XHR9O1xuXHR9KSJdfQ==
