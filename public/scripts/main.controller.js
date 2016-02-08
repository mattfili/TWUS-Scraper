'use strict';

angular.module('scraper').controller('main', function ($scope, FileUploader, XLSXReaderService, Add) {

    var uploader = $scope.uploader = new FileUploader({
        url: 'api/load'
    });

    uploader.onWhenAddingFileFailed = function (item, /*{File|FileLikeObject}*/filter, options) {
        console.info('onWhenAddingFileFailed', item, filter, options);
    };
    uploader.onAfterAddingFile = function (fileItem) {
        console.info('onAfterAddingFile', fileItem);
    };
    uploader.onAfterAddingAll = function (addedFileItems) {
        console.info('onAfterAddingAll', addedFileItems);
    };
    uploader.onBeforeUploadItem = function (item) {
        console.info('onBeforeUploadItem', item);
    };
    uploader.onProgressItem = function (fileItem, progress) {
        console.info('onProgressItem', fileItem, progress);
        // Add.ship(fileItem.file);
    };
    uploader.onProgressAll = function (progress) {
        console.info('onProgressAll', progress);
    };
    uploader.onSuccessItem = function (fileItem, response, status, headers) {
        console.info('onSuccessItem', fileItem, response, status, headers);
        console.log(fileItem);
        // Add.ship(fileItem.file);
    };
    uploader.onErrorItem = function (fileItem, response, status, headers) {
        console.info('onErrorItem', fileItem, response, status, headers);
    };
    uploader.onCancelItem = function (fileItem, response, status, headers) {
        console.info('onCancelItem', fileItem, response, status, headers);
    };
    uploader.onCompleteItem = function (fileItem, response, status, headers) {
        console.info('onCompleteItem', fileItem, response, status, headers);
        // Add.ship(fileItem.file);
    };
    uploader.onCompleteAll = function () {
        console.info('onCompleteAll');
    };

    console.info('uploader', uploader);

    //    $scope.showPreview = false;

    // $scope.fileChanged = function(files) {
    //     $scope.sheets = [];
    //     $scope.excelFile = files[0];
    //     XLSXReaderService.readFile($scope.excelFile, $scope.showPreview).then(function(xlsxData) {
    //         $scope.sheets = xlsxData.sheets;
    //     });
    // };

    // $scope.showPreviewChanged = function() {
    //     if ($scope.showPreview) {
    //         XLSXReaderService.readFile($scope.excelFile, $scope.showPreview).then(function(xlsxData) {
    //             $scope.sheets = xlsxData.sheets;
    //         });
    //     };
    // };
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9zY3JpcHRzL21haW4uY29udHJvbGxlci5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBLE9BQU8sQ0FDTixNQUFNLENBQUMsU0FBUyxDQUFDLENBRWpCLFVBQVUsQ0FBQyxNQUFNLEVBQUUsVUFBUyxNQUFNLEVBQUUsWUFBWSxFQUFFLGlCQUFpQixFQUFFLEdBQUcsRUFBRTs7QUFFekUsUUFBSSxRQUFRLEdBQUcsTUFBTSxDQUFDLFFBQVEsR0FBRyxJQUFJLFlBQVksQ0FBQztBQUNqRCxXQUFHLEVBQUUsVUFBVTtLQUNmLENBQUMsQ0FBQTs7QUFFRixZQUFRLENBQUMsc0JBQXNCLEdBQUcsVUFBUyxJQUFJLDJCQUE0QixNQUFNLEVBQUUsT0FBTyxFQUFFO0FBQ2xGLGVBQU8sQ0FBQyxJQUFJLENBQUMsd0JBQXdCLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsQ0FBQztLQUNqRSxDQUFDO0FBQ0YsWUFBUSxDQUFDLGlCQUFpQixHQUFHLFVBQVMsUUFBUSxFQUFFO0FBQzVDLGVBQU8sQ0FBQyxJQUFJLENBQUMsbUJBQW1CLEVBQUUsUUFBUSxDQUFDLENBQUM7S0FDL0MsQ0FBQztBQUNGLFlBQVEsQ0FBQyxnQkFBZ0IsR0FBRyxVQUFTLGNBQWMsRUFBRTtBQUNqRCxlQUFPLENBQUMsSUFBSSxDQUFDLGtCQUFrQixFQUFFLGNBQWMsQ0FBQyxDQUFDO0tBQ3BELENBQUM7QUFDRixZQUFRLENBQUMsa0JBQWtCLEdBQUcsVUFBUyxJQUFJLEVBQUU7QUFDekMsZUFBTyxDQUFDLElBQUksQ0FBQyxvQkFBb0IsRUFBRSxJQUFJLENBQUMsQ0FBQztLQUM1QyxDQUFDO0FBQ0YsWUFBUSxDQUFDLGNBQWMsR0FBRyxVQUFTLFFBQVEsRUFBRSxRQUFRLEVBQUU7QUFDbkQsZUFBTyxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxRQUFRLEVBQUUsUUFBUSxDQUFDLENBQUM7O0tBRXRELENBQUM7QUFDRixZQUFRLENBQUMsYUFBYSxHQUFHLFVBQVMsUUFBUSxFQUFFO0FBQ3hDLGVBQU8sQ0FBQyxJQUFJLENBQUMsZUFBZSxFQUFFLFFBQVEsQ0FBQyxDQUFDO0tBQzNDLENBQUM7QUFDRixZQUFRLENBQUMsYUFBYSxHQUFHLFVBQVMsUUFBUSxFQUFFLFFBQVEsRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFO0FBQ25FLGVBQU8sQ0FBQyxJQUFJLENBQUMsZUFBZSxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxDQUFDO0FBQ25FLGVBQU8sQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLENBQUM7O0tBRXpCLENBQUM7QUFDRixZQUFRLENBQUMsV0FBVyxHQUFHLFVBQVMsUUFBUSxFQUFFLFFBQVEsRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFO0FBQ2pFLGVBQU8sQ0FBQyxJQUFJLENBQUMsYUFBYSxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxDQUFDO0tBQ3BFLENBQUM7QUFDRixZQUFRLENBQUMsWUFBWSxHQUFHLFVBQVMsUUFBUSxFQUFFLFFBQVEsRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFO0FBQ2xFLGVBQU8sQ0FBQyxJQUFJLENBQUMsY0FBYyxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxDQUFDO0tBQ3JFLENBQUM7QUFDRixZQUFRLENBQUMsY0FBYyxHQUFHLFVBQVMsUUFBUSxFQUFFLFFBQVEsRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFO0FBQ3BFLGVBQU8sQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLENBQUM7O0tBRXZFLENBQUM7QUFDRixZQUFRLENBQUMsYUFBYSxHQUFHLFlBQVc7QUFDaEMsZUFBTyxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQztLQUNqQyxDQUFDOztBQUVGLFdBQU8sQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLFFBQVEsQ0FBQyxDQUFDOzs7Ozs7Ozs7Ozs7Ozs7Ozs7O0NBbUIxQyxDQUFDLENBQUEiLCJmaWxlIjoibWFpbi5jb250cm9sbGVyLmpzIiwic291cmNlc0NvbnRlbnQiOlsiYW5ndWxhclxuLm1vZHVsZSgnc2NyYXBlcicpXG5cbi5jb250cm9sbGVyKCdtYWluJywgZnVuY3Rpb24oJHNjb3BlLCBGaWxlVXBsb2FkZXIsIFhMU1hSZWFkZXJTZXJ2aWNlLCBBZGQpIHtcblxuXHRcdHZhciB1cGxvYWRlciA9ICRzY29wZS51cGxvYWRlciA9IG5ldyBGaWxlVXBsb2FkZXIoe1xuXHRcdFx0dXJsOiAnYXBpL2xvYWQnXG5cdFx0fSlcblxuXHRcdHVwbG9hZGVyLm9uV2hlbkFkZGluZ0ZpbGVGYWlsZWQgPSBmdW5jdGlvbihpdGVtIC8qe0ZpbGV8RmlsZUxpa2VPYmplY3R9Ki8sIGZpbHRlciwgb3B0aW9ucykge1xuICAgICAgICAgICAgY29uc29sZS5pbmZvKCdvbldoZW5BZGRpbmdGaWxlRmFpbGVkJywgaXRlbSwgZmlsdGVyLCBvcHRpb25zKTtcbiAgICAgICAgfTtcbiAgICAgICAgdXBsb2FkZXIub25BZnRlckFkZGluZ0ZpbGUgPSBmdW5jdGlvbihmaWxlSXRlbSkge1xuICAgICAgICAgICAgY29uc29sZS5pbmZvKCdvbkFmdGVyQWRkaW5nRmlsZScsIGZpbGVJdGVtKTtcbiAgICAgICAgfTtcbiAgICAgICAgdXBsb2FkZXIub25BZnRlckFkZGluZ0FsbCA9IGZ1bmN0aW9uKGFkZGVkRmlsZUl0ZW1zKSB7XG4gICAgICAgICAgICBjb25zb2xlLmluZm8oJ29uQWZ0ZXJBZGRpbmdBbGwnLCBhZGRlZEZpbGVJdGVtcyk7XG4gICAgICAgIH07XG4gICAgICAgIHVwbG9hZGVyLm9uQmVmb3JlVXBsb2FkSXRlbSA9IGZ1bmN0aW9uKGl0ZW0pIHtcbiAgICAgICAgICAgIGNvbnNvbGUuaW5mbygnb25CZWZvcmVVcGxvYWRJdGVtJywgaXRlbSk7XG4gICAgICAgIH07XG4gICAgICAgIHVwbG9hZGVyLm9uUHJvZ3Jlc3NJdGVtID0gZnVuY3Rpb24oZmlsZUl0ZW0sIHByb2dyZXNzKSB7XG4gICAgICAgICAgICBjb25zb2xlLmluZm8oJ29uUHJvZ3Jlc3NJdGVtJywgZmlsZUl0ZW0sIHByb2dyZXNzKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIEFkZC5zaGlwKGZpbGVJdGVtLmZpbGUpO1xuICAgICAgICB9O1xuICAgICAgICB1cGxvYWRlci5vblByb2dyZXNzQWxsID0gZnVuY3Rpb24ocHJvZ3Jlc3MpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuaW5mbygnb25Qcm9ncmVzc0FsbCcsIHByb2dyZXNzKTtcbiAgICAgICAgfTtcbiAgICAgICAgdXBsb2FkZXIub25TdWNjZXNzSXRlbSA9IGZ1bmN0aW9uKGZpbGVJdGVtLCByZXNwb25zZSwgc3RhdHVzLCBoZWFkZXJzKSB7XG4gICAgICAgICAgICBjb25zb2xlLmluZm8oJ29uU3VjY2Vzc0l0ZW0nLCBmaWxlSXRlbSwgcmVzcG9uc2UsIHN0YXR1cywgaGVhZGVycyk7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhmaWxlSXRlbSk7XG4gICAgICAgICAgICAvLyBBZGQuc2hpcChmaWxlSXRlbS5maWxlKTtcbiAgICAgICAgfTtcbiAgICAgICAgdXBsb2FkZXIub25FcnJvckl0ZW0gPSBmdW5jdGlvbihmaWxlSXRlbSwgcmVzcG9uc2UsIHN0YXR1cywgaGVhZGVycykge1xuICAgICAgICAgICAgY29uc29sZS5pbmZvKCdvbkVycm9ySXRlbScsIGZpbGVJdGVtLCByZXNwb25zZSwgc3RhdHVzLCBoZWFkZXJzKTtcbiAgICAgICAgfTtcbiAgICAgICAgdXBsb2FkZXIub25DYW5jZWxJdGVtID0gZnVuY3Rpb24oZmlsZUl0ZW0sIHJlc3BvbnNlLCBzdGF0dXMsIGhlYWRlcnMpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuaW5mbygnb25DYW5jZWxJdGVtJywgZmlsZUl0ZW0sIHJlc3BvbnNlLCBzdGF0dXMsIGhlYWRlcnMpO1xuICAgICAgICB9O1xuICAgICAgICB1cGxvYWRlci5vbkNvbXBsZXRlSXRlbSA9IGZ1bmN0aW9uKGZpbGVJdGVtLCByZXNwb25zZSwgc3RhdHVzLCBoZWFkZXJzKSB7XG4gICAgICAgICAgICBjb25zb2xlLmluZm8oJ29uQ29tcGxldGVJdGVtJywgZmlsZUl0ZW0sIHJlc3BvbnNlLCBzdGF0dXMsIGhlYWRlcnMpO1xuICAgICAgICAgICAgLy8gQWRkLnNoaXAoZmlsZUl0ZW0uZmlsZSk7XG4gICAgICAgIH07XG4gICAgICAgIHVwbG9hZGVyLm9uQ29tcGxldGVBbGwgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuaW5mbygnb25Db21wbGV0ZUFsbCcpO1xuICAgICAgICB9O1xuXG4gICAgICAgIGNvbnNvbGUuaW5mbygndXBsb2FkZXInLCB1cGxvYWRlcik7XG5cbiAgICAgLy8gICAgJHNjb3BlLnNob3dQcmV2aWV3ID0gZmFsc2U7XG5cblx0ICAgIC8vICRzY29wZS5maWxlQ2hhbmdlZCA9IGZ1bmN0aW9uKGZpbGVzKSB7XG5cdCAgICAvLyAgICAgJHNjb3BlLnNoZWV0cyA9IFtdO1xuXHQgICAgLy8gICAgICRzY29wZS5leGNlbEZpbGUgPSBmaWxlc1swXTtcblx0ICAgIC8vICAgICBYTFNYUmVhZGVyU2VydmljZS5yZWFkRmlsZSgkc2NvcGUuZXhjZWxGaWxlLCAkc2NvcGUuc2hvd1ByZXZpZXcpLnRoZW4oZnVuY3Rpb24oeGxzeERhdGEpIHtcblx0ICAgIC8vICAgICAgICAgJHNjb3BlLnNoZWV0cyA9IHhsc3hEYXRhLnNoZWV0cztcblx0ICAgIC8vICAgICB9KTtcblx0ICAgIC8vIH07XG5cblx0ICAgIC8vICRzY29wZS5zaG93UHJldmlld0NoYW5nZWQgPSBmdW5jdGlvbigpIHtcblx0ICAgIC8vICAgICBpZiAoJHNjb3BlLnNob3dQcmV2aWV3KSB7XG5cdCAgICAvLyAgICAgICAgIFhMU1hSZWFkZXJTZXJ2aWNlLnJlYWRGaWxlKCRzY29wZS5leGNlbEZpbGUsICRzY29wZS5zaG93UHJldmlldykudGhlbihmdW5jdGlvbih4bHN4RGF0YSkge1xuXHQgICAgLy8gICAgICAgICAgICAgJHNjb3BlLnNoZWV0cyA9IHhsc3hEYXRhLnNoZWV0cztcblx0ICAgIC8vICAgICAgICAgfSk7XG5cdCAgICAvLyAgICAgfTtcblx0ICAgIC8vIH07XG59KSJdfQ==
