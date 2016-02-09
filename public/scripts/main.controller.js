'use strict';

angular.module('scraper').controller('main', function ($scope, FileUploader, Add) {

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
    };
    uploader.onErrorItem = function (fileItem, response, status, headers) {
        console.info('onErrorItem', fileItem, response, status, headers);
    };
    uploader.onCancelItem = function (fileItem, response, status, headers) {
        console.info('onCancelItem', fileItem, response, status, headers);
    };
    uploader.onCompleteItem = function (fileItem, response, status, headers) {
        console.info('onCompleteItem', fileItem, response, status, headers);
        $scope.json = response;
    };
    uploader.onCompleteAll = function () {
        console.info('onCompleteAll');
    };

    console.info('uploader', uploader);

    $scope.getJson = function () {
        $scope.json;
    };

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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9zY3JpcHRzL21haW4uY29udHJvbGxlci5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBLE9BQU8sQ0FDTixNQUFNLENBQUMsU0FBUyxDQUFDLENBRWpCLFVBQVUsQ0FBQyxNQUFNLEVBQUUsVUFBUyxNQUFNLEVBQUUsWUFBWSxFQUFFLEdBQUcsRUFBRTs7QUFFdEQsUUFBSSxRQUFRLEdBQUcsTUFBTSxDQUFDLFFBQVEsR0FBRyxJQUFJLFlBQVksQ0FBQztBQUNqRCxXQUFHLEVBQUUsVUFBVTtLQUNmLENBQUMsQ0FBQTs7QUFFRixZQUFRLENBQUMsc0JBQXNCLEdBQUcsVUFBUyxJQUFJLDJCQUE0QixNQUFNLEVBQUUsT0FBTyxFQUFFO0FBQ2xGLGVBQU8sQ0FBQyxJQUFJLENBQUMsd0JBQXdCLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsQ0FBQztLQUNqRSxDQUFDO0FBQ0YsWUFBUSxDQUFDLGlCQUFpQixHQUFHLFVBQVMsUUFBUSxFQUFFO0FBQzVDLGVBQU8sQ0FBQyxJQUFJLENBQUMsbUJBQW1CLEVBQUUsUUFBUSxDQUFDLENBQUM7S0FDL0MsQ0FBQztBQUNGLFlBQVEsQ0FBQyxnQkFBZ0IsR0FBRyxVQUFTLGNBQWMsRUFBRTtBQUNqRCxlQUFPLENBQUMsSUFBSSxDQUFDLGtCQUFrQixFQUFFLGNBQWMsQ0FBQyxDQUFDO0tBQ3BELENBQUM7QUFDRixZQUFRLENBQUMsa0JBQWtCLEdBQUcsVUFBUyxJQUFJLEVBQUU7QUFDekMsZUFBTyxDQUFDLElBQUksQ0FBQyxvQkFBb0IsRUFBRSxJQUFJLENBQUMsQ0FBQztLQUM1QyxDQUFDO0FBQ0YsWUFBUSxDQUFDLGNBQWMsR0FBRyxVQUFTLFFBQVEsRUFBRSxRQUFRLEVBQUU7QUFDbkQsZUFBTyxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxRQUFRLEVBQUUsUUFBUSxDQUFDLENBQUM7O0tBRXRELENBQUM7QUFDRixZQUFRLENBQUMsYUFBYSxHQUFHLFVBQVMsUUFBUSxFQUFFO0FBQ3hDLGVBQU8sQ0FBQyxJQUFJLENBQUMsZUFBZSxFQUFFLFFBQVEsQ0FBQyxDQUFDO0tBQzNDLENBQUM7QUFDRixZQUFRLENBQUMsYUFBYSxHQUFHLFVBQVMsUUFBUSxFQUFFLFFBQVEsRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFO0FBQ25FLGVBQU8sQ0FBQyxJQUFJLENBQUMsZUFBZSxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxDQUFDO0tBRXRFLENBQUM7QUFDRixZQUFRLENBQUMsV0FBVyxHQUFHLFVBQVMsUUFBUSxFQUFFLFFBQVEsRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFO0FBQ2pFLGVBQU8sQ0FBQyxJQUFJLENBQUMsYUFBYSxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxDQUFDO0tBQ3BFLENBQUM7QUFDRixZQUFRLENBQUMsWUFBWSxHQUFHLFVBQVMsUUFBUSxFQUFFLFFBQVEsRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFO0FBQ2xFLGVBQU8sQ0FBQyxJQUFJLENBQUMsY0FBYyxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxDQUFDO0tBQ3JFLENBQUM7QUFDRixZQUFRLENBQUMsY0FBYyxHQUFHLFVBQVMsUUFBUSxFQUFFLFFBQVEsRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFO0FBQ3BFLGVBQU8sQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLENBQUM7QUFDckUsY0FBTSxDQUFDLElBQUksR0FBRyxRQUFRLENBQUM7S0FFekIsQ0FBQztBQUNGLFlBQVEsQ0FBQyxhQUFhLEdBQUcsWUFBVztBQUNoQyxlQUFPLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxDQUFDO0tBQ2pDLENBQUM7O0FBRUYsV0FBTyxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsUUFBUSxDQUFDLENBQUM7O0FBRW5DLFVBQU0sQ0FBQyxPQUFPLEdBQUcsWUFBWTtBQUMxQixjQUFNLENBQUMsSUFBSSxDQUFDO0tBQ2QsQ0FBQTs7Ozs7Ozs7Ozs7Ozs7Ozs7OztDQW1CUixDQUFDLENBQUEiLCJmaWxlIjoibWFpbi5jb250cm9sbGVyLmpzIiwic291cmNlc0NvbnRlbnQiOlsiYW5ndWxhclxuLm1vZHVsZSgnc2NyYXBlcicpXG5cbi5jb250cm9sbGVyKCdtYWluJywgZnVuY3Rpb24oJHNjb3BlLCBGaWxlVXBsb2FkZXIsIEFkZCkge1xuXG5cdFx0dmFyIHVwbG9hZGVyID0gJHNjb3BlLnVwbG9hZGVyID0gbmV3IEZpbGVVcGxvYWRlcih7XG5cdFx0XHR1cmw6ICdhcGkvbG9hZCdcblx0XHR9KVxuXG5cdFx0dXBsb2FkZXIub25XaGVuQWRkaW5nRmlsZUZhaWxlZCA9IGZ1bmN0aW9uKGl0ZW0gLyp7RmlsZXxGaWxlTGlrZU9iamVjdH0qLywgZmlsdGVyLCBvcHRpb25zKSB7XG4gICAgICAgICAgICBjb25zb2xlLmluZm8oJ29uV2hlbkFkZGluZ0ZpbGVGYWlsZWQnLCBpdGVtLCBmaWx0ZXIsIG9wdGlvbnMpO1xuICAgICAgICB9O1xuICAgICAgICB1cGxvYWRlci5vbkFmdGVyQWRkaW5nRmlsZSA9IGZ1bmN0aW9uKGZpbGVJdGVtKSB7XG4gICAgICAgICAgICBjb25zb2xlLmluZm8oJ29uQWZ0ZXJBZGRpbmdGaWxlJywgZmlsZUl0ZW0pO1xuICAgICAgICB9O1xuICAgICAgICB1cGxvYWRlci5vbkFmdGVyQWRkaW5nQWxsID0gZnVuY3Rpb24oYWRkZWRGaWxlSXRlbXMpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuaW5mbygnb25BZnRlckFkZGluZ0FsbCcsIGFkZGVkRmlsZUl0ZW1zKTtcbiAgICAgICAgfTtcbiAgICAgICAgdXBsb2FkZXIub25CZWZvcmVVcGxvYWRJdGVtID0gZnVuY3Rpb24oaXRlbSkge1xuICAgICAgICAgICAgY29uc29sZS5pbmZvKCdvbkJlZm9yZVVwbG9hZEl0ZW0nLCBpdGVtKTtcbiAgICAgICAgfTtcbiAgICAgICAgdXBsb2FkZXIub25Qcm9ncmVzc0l0ZW0gPSBmdW5jdGlvbihmaWxlSXRlbSwgcHJvZ3Jlc3MpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuaW5mbygnb25Qcm9ncmVzc0l0ZW0nLCBmaWxlSXRlbSwgcHJvZ3Jlc3MpO1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gQWRkLnNoaXAoZmlsZUl0ZW0uZmlsZSk7XG4gICAgICAgIH07XG4gICAgICAgIHVwbG9hZGVyLm9uUHJvZ3Jlc3NBbGwgPSBmdW5jdGlvbihwcm9ncmVzcykge1xuICAgICAgICAgICAgY29uc29sZS5pbmZvKCdvblByb2dyZXNzQWxsJywgcHJvZ3Jlc3MpO1xuICAgICAgICB9O1xuICAgICAgICB1cGxvYWRlci5vblN1Y2Nlc3NJdGVtID0gZnVuY3Rpb24oZmlsZUl0ZW0sIHJlc3BvbnNlLCBzdGF0dXMsIGhlYWRlcnMpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuaW5mbygnb25TdWNjZXNzSXRlbScsIGZpbGVJdGVtLCByZXNwb25zZSwgc3RhdHVzLCBoZWFkZXJzKTtcblxuICAgICAgICB9O1xuICAgICAgICB1cGxvYWRlci5vbkVycm9ySXRlbSA9IGZ1bmN0aW9uKGZpbGVJdGVtLCByZXNwb25zZSwgc3RhdHVzLCBoZWFkZXJzKSB7XG4gICAgICAgICAgICBjb25zb2xlLmluZm8oJ29uRXJyb3JJdGVtJywgZmlsZUl0ZW0sIHJlc3BvbnNlLCBzdGF0dXMsIGhlYWRlcnMpO1xuICAgICAgICB9O1xuICAgICAgICB1cGxvYWRlci5vbkNhbmNlbEl0ZW0gPSBmdW5jdGlvbihmaWxlSXRlbSwgcmVzcG9uc2UsIHN0YXR1cywgaGVhZGVycykge1xuICAgICAgICAgICAgY29uc29sZS5pbmZvKCdvbkNhbmNlbEl0ZW0nLCBmaWxlSXRlbSwgcmVzcG9uc2UsIHN0YXR1cywgaGVhZGVycyk7XG4gICAgICAgIH07XG4gICAgICAgIHVwbG9hZGVyLm9uQ29tcGxldGVJdGVtID0gZnVuY3Rpb24oZmlsZUl0ZW0sIHJlc3BvbnNlLCBzdGF0dXMsIGhlYWRlcnMpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuaW5mbygnb25Db21wbGV0ZUl0ZW0nLCBmaWxlSXRlbSwgcmVzcG9uc2UsIHN0YXR1cywgaGVhZGVycyk7XG4gICAgICAgICAgICRzY29wZS5qc29uID0gcmVzcG9uc2U7XG5cbiAgICAgICAgfTtcbiAgICAgICAgdXBsb2FkZXIub25Db21wbGV0ZUFsbCA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgY29uc29sZS5pbmZvKCdvbkNvbXBsZXRlQWxsJyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgY29uc29sZS5pbmZvKCd1cGxvYWRlcicsIHVwbG9hZGVyKTtcblxuICAgICAgICAkc2NvcGUuZ2V0SnNvbiA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgJHNjb3BlLmpzb247XG4gICAgICAgIH1cblxuICAgICAvLyAgICAkc2NvcGUuc2hvd1ByZXZpZXcgPSBmYWxzZTtcblxuXHQgICAgLy8gJHNjb3BlLmZpbGVDaGFuZ2VkID0gZnVuY3Rpb24oZmlsZXMpIHtcblx0ICAgIC8vICAgICAkc2NvcGUuc2hlZXRzID0gW107XG5cdCAgICAvLyAgICAgJHNjb3BlLmV4Y2VsRmlsZSA9IGZpbGVzWzBdO1xuXHQgICAgLy8gICAgIFhMU1hSZWFkZXJTZXJ2aWNlLnJlYWRGaWxlKCRzY29wZS5leGNlbEZpbGUsICRzY29wZS5zaG93UHJldmlldykudGhlbihmdW5jdGlvbih4bHN4RGF0YSkge1xuXHQgICAgLy8gICAgICAgICAkc2NvcGUuc2hlZXRzID0geGxzeERhdGEuc2hlZXRzO1xuXHQgICAgLy8gICAgIH0pO1xuXHQgICAgLy8gfTtcblxuXHQgICAgLy8gJHNjb3BlLnNob3dQcmV2aWV3Q2hhbmdlZCA9IGZ1bmN0aW9uKCkge1xuXHQgICAgLy8gICAgIGlmICgkc2NvcGUuc2hvd1ByZXZpZXcpIHtcblx0ICAgIC8vICAgICAgICAgWExTWFJlYWRlclNlcnZpY2UucmVhZEZpbGUoJHNjb3BlLmV4Y2VsRmlsZSwgJHNjb3BlLnNob3dQcmV2aWV3KS50aGVuKGZ1bmN0aW9uKHhsc3hEYXRhKSB7XG5cdCAgICAvLyAgICAgICAgICAgICAkc2NvcGUuc2hlZXRzID0geGxzeERhdGEuc2hlZXRzO1xuXHQgICAgLy8gICAgICAgICB9KTtcblx0ICAgIC8vICAgICB9O1xuXHQgICAgLy8gfTtcbn0pIl19
