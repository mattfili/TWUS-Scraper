angular
.module('scraper')

.controller('main', function($scope, FileUploader, Add) {

		var uploader = $scope.uploader = new FileUploader({
			url: 'api/load'
		})

		uploader.onWhenAddingFileFailed = function(item /*{File|FileLikeObject}*/, filter, options) {
            console.info('onWhenAddingFileFailed', item, filter, options);
        };
        uploader.onAfterAddingFile = function(fileItem) {
            console.info('onAfterAddingFile', fileItem);
        };
        uploader.onAfterAddingAll = function(addedFileItems) {
            console.info('onAfterAddingAll', addedFileItems);
        };
        uploader.onBeforeUploadItem = function(item) {
            console.info('onBeforeUploadItem', item);
        };
        uploader.onProgressItem = function(fileItem, progress) {
            console.info('onProgressItem', fileItem, progress);
                        // Add.ship(fileItem.file);
        };
        uploader.onProgressAll = function(progress) {
            console.info('onProgressAll', progress);
        };
        uploader.onSuccessItem = function(fileItem, response, status, headers) {
            console.info('onSuccessItem', fileItem, response, status, headers);
            console.log(fileItem);
            // Add.ship(fileItem.file);
        };
        uploader.onErrorItem = function(fileItem, response, status, headers) {
            console.info('onErrorItem', fileItem, response, status, headers);
        };
        uploader.onCancelItem = function(fileItem, response, status, headers) {
            console.info('onCancelItem', fileItem, response, status, headers);
        };
        uploader.onCompleteItem = function(fileItem, response, status, headers) {
            console.info('onCompleteItem', fileItem, response, status, headers);
            Add.exportExcel();
        };
        uploader.onCompleteAll = function() {
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
})