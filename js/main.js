window.onload = function(){
    console.log('hello :)');
    $('.oe_install_button').click(function(){
        var $this = $(this);
        if ($this.hasClass('oe_installed')){
            var $menu = $this.find('.oe_dropdown_menu');
            if($menu.is(':visible')){
                $menu.css({'opacity':'0'}).hide();
            }else{
                $menu.show().animate({'opacity':'1'},250);
            }
        }else{
            $this.addClass('oe_installed');
            $this.find('.oe_label').html('Installed');
            $this.find('.oe_dropdown').show();
        }
    });
};
