FROM debian:testing

ENV TEXMFVAR=/var/lib/sharelatex/tmp/texmf-var

RUN echo "deb http://mirrors.ustc.edu.cn/debian/ testing main" > /etc/apt/sources.list
RUN echo "deb http://mirrors.ustc.edu.cn/debian/ testing-updates main" >> /etc/apt/sources.list
RUN apt-get update && apt install -y --no-install-recommends fontconfig inkscape pandoc python3-pygments xfonts-utils tex-common texinfo equivs perl-tk perl-doc wget ca-certificates rsync && apt clean

# add truetype fonts
RUN mkdir -p /usr/share/fonts/truetype
ADD ./msttcorefonts /usr/share/fonts/truetype
RUN cd /usr/share/fonts/truetype && mkfontscale && mkfontdir && fc-cache -fsv
# RUN apt-cache depends texlive-full | grep "Depends: " | grep -v -- "-doc" | grep -v -- "-lang-" | sed 's/Depends: //' | xargs 
# apt-get install -y --no-install-recommends

#mirror.nju.edu.cn/tex-historic/ 
#https://ftp.math.utah.edu/pub/tex/historic/

RUN wget -O - -- https://mirrors.tuna.tsinghua.edu.cn/tex-historic-archive/systems/texlive/2019/install-tl-unx.tar.gz | tar xzf - --strip-components=1
RUN sh -c '/bin/echo -e "I\n" | perl ./install-tl -repository https://mirrors.tuna.tsinghua.edu.cn/tex-historic-archive/systems/texlive/2019/tlnet-final/ -scheme full'

RUN $(find /usr/local/texlive -name tlmgr) path add \
&&  tlmgr install --repository https://mirrors.tuna.tsinghua.edu.cn/tex-historic-archive/systems/texlive/2019/tlnet-final \
      latexmk \
      texcount \
      synctex \
      etoolbox \
    \
&&  tlmgr path add

# ENV PATH="/usr/local/texlive/2019/bin/x86_64-linux:${PATH}"
# RUN apt install -y texlive-full texlive-lang-cjk texlive-lang-chinese texlive-lang-japanese texlive-lang-korean texlive-font-utils texlive-fonts-extra texlive-extra-utils texlive-science

RUN useradd -m tex
USER tex
