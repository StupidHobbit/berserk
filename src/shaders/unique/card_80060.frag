#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D u_card;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_seed;
uniform bool u_is_foil;
varying vec2 v_uv;

// Архимаг Дхайа: three aligned discharges race out of the painted hands.
// Scan coordinates use a top-left origin. No printed frame is resampled.
float ellipse(vec2 p, vec2 c, vec2 r) {
    return 1.0-smoothstep(0.5,1.0,length((p-c)/r));
}
vec2 wire(vec2 p, vec2 a, vec2 b, float lo, float hi, float t, float aa) {
    vec2 ab=b-a;
    float h=clamp(dot(p-a,ab)/dot(ab,ab),0.0,1.0);
    float d=length((p-a-ab*h)*vec2(1.0,1.42));
    float along=mix(lo,hi,h);
    float train=pow(0.5+0.5*cos(6.2831853*(along*2.0-t*0.78)),12.0);
    float core=1.0-smoothstep(0.0015,0.0035+aa*0.65,d);
    float halo=exp(-d/0.012);
    return vec2(core*(0.12+train*0.88),halo*train);
}
void main() {
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    vec4 scan=texture2D(u_card,v_uv);
    float aa=1.0/max(1.0,u_resolution.x);
    float t=u_time+fract(u_seed*0.173)*5.0;
    float art=smoothstep(0.137,0.151,p.y)*(1.0-smoothstep(0.533,0.545,p.y));
    art*=smoothstep(0.024,0.042,p.x)*(1.0-smoothstep(0.960,0.980,p.x));
    // The lightning-resistance badge includes its gold outer rim.
    art*=smoothstep(0.061,0.078,length((p-vec2(0.108,0.179))*vec2(1.0,1.42)));
    vec3 col=scan.rgb;
    vec2 flux=vec2(0.0);
    // Right-hand bolt: preserve the illustration's distinctive angular turns.
    flux+=wire(p,vec2(.495,.208),vec2(.558,.200),.00,.07,t,aa);
    flux+=wire(p,vec2(.558,.200),vec2(.493,.231),.07,.15,t,aa);
    flux+=wire(p,vec2(.493,.231),vec2(.550,.242),.15,.20,t,aa);
    flux+=wire(p,vec2(.550,.242),vec2(.434,.283),.20,.33,t,aa);
    flux+=wire(p,vec2(.434,.283),vec2(.620,.253),.33,.51,t,aa);
    flux+=wire(p,vec2(.620,.253),vec2(.639,.278),.51,.55,t,aa);
    flux+=wire(p,vec2(.639,.278),vec2(.612,.302),.55,.59,t,aa);
    flux+=wire(p,vec2(.612,.302),vec2(.642,.337),.59,.64,t,aa);
    flux+=wire(p,vec2(.642,.337),vec2(.573,.352),.64,.71,t,aa);
    flux+=wire(p,vec2(.573,.352),vec2(.588,.411),.71,.80,t,aa);
    flux+=wire(p,vec2(.588,.411),vec2(.642,.471),.80,.90,t,aa);
    flux+=wire(p,vec2(.642,.471),vec2(.681,.471),.90,.94,t,aa);
    flux+=wire(p,vec2(.681,.471),vec2(.747,.404),.94,1.04,t,aa);
    // Left-hand discharge travels around the foreground soldier's silhouette.
    flux+=wire(p,vec2(.304,.242),vec2(.287,.281),.00,.06,t+.35,aa);
    flux+=wire(p,vec2(.287,.281),vec2(.358,.275),.06,.13,t+.35,aa);
    flux+=wire(p,vec2(.358,.275),vec2(.391,.293),.13,.18,t+.35,aa);
    flux+=wire(p,vec2(.391,.293),vec2(.359,.335),.18,.25,t+.35,aa);
    flux+=wire(p,vec2(.359,.335),vec2(.423,.341),.25,.32,t+.35,aa);
    flux+=wire(p,vec2(.423,.341),vec2(.419,.352),.32,.34,t+.35,aa);
    flux+=wire(p,vec2(.419,.352),vec2(.338,.351),.34,.42,t+.35,aa);
    flux+=wire(p,vec2(.338,.351),vec2(.309,.383),.42,.47,t+.35,aa);
    flux+=wire(p,vec2(.309,.383),vec2(.224,.385),.47,.56,t+.35,aa);
    flux+=wire(p,vec2(.224,.385),vec2(.108,.438),.56,.70,t+.35,aa);
    flux+=wire(p,vec2(.108,.438),vec2(.235,.472),.70,.84,t+.35,aa);
    flux+=wire(p,vec2(.235,.472),vec2(.303,.492),.84,.92,t+.35,aa);
    flux=clamp(flux,0.0,1.6);
    // Saturated cores visibly move over the original pale lightning.
    col=mix(col,vec3(.06,.50,.98),flux.x*.52);
    col+=vec3(.06,.27,.43)*flux.y;

    // Three staggered expanding charge fronts on the same battlefield line.
    float rings=0.0;
    float motes=0.0;
    for(int i=0;i<3;i++) {
        float k=float(i);
        vec2 origin=vec2(.205+k*.302,.426);
        float q=fract(t*.55-k*.22);
        float radius=.012+q*.084;
        float d=abs(length((p-origin)*vec2(1.0,2.8))-radius);
        float fade=smoothstep(0.0,.12,q)*(1.0-smoothstep(.55,1.0,q));
        rings+=(1.0-smoothstep(.0015,.0035+aa,d))*fade;
    }
    // Ejected electrical sparks spiral away from the casting hand.
    for(int i=0;i<9;i++) {
        float k=float(i);
        float q=fract(t*.29+k*.1111);
        float angle=k*2.399+t*.28;
        vec2 c=vec2(.493,.208)+vec2(cos(angle),sin(angle)*.60)*(.012+q*.092);
        float d=length((p-c)*vec2(1.0,1.42));
        float fade=smoothstep(0.0,.1,q)*(1.0-smoothstep(.64,1.0,q));
        motes+=(1.0-smoothstep(.001,.0035+aa*.7,d))*fade;
    }
    col+=vec3(.08,.35,.64)*rings*.66;
    col+=vec3(.32,.69,.91)*motes*.82;
    float hand=ellipse(p,vec2(.493,.208),vec2(.042,.024));
    col+=vec3(.06,.24,.43)*hand*(.45+.35*sin(t*5.0));

    if(u_is_foil) {
        float lum=dot(scan.rgb,vec3(.2126,.7152,.0722));
        // Broad cobalt/copper iridescence is visible even at time zero.
        float phase=p.x*1.55+p.y*2.1-t*.10+fract(u_seed*.071);
        vec3 hue=.5+.5*cos(6.2831853*(phase+vec3(.0,.33,.67)));
        vec3 overlay=mix(2.0*col*hue,1.0-2.0*(1.0-col)*(1.0-hue),step(vec3(.5),col));
        col=mix(col,overlay,.38);
        float ice=smoothstep(.12,.58,lum)*smoothstep(-.05,.16,scan.b-scan.r);
        float facets=pow(.5+.5*sin(p.x*43.0+p.y*31.0-t*1.7),14.0);
        col+=(1.0-col)*(hue*.38+vec3(.02,.06,.1))*ice*facets*.65;
        col+=hue*flux.x*.22;
    }
    gl_FragColor=vec4(mix(scan.rgb,clamp(col,0.0,1.0),art),scan.a);
}
