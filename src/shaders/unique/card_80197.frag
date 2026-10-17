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

float oval(vec2 p,vec2 c,vec2 r) {
    return 1.0-smoothstep(0.0,1.0,length((p-c)/r));
}
float lineDist(vec2 p,vec2 a,vec2 b) {
    vec2 v=b-a;
    return length(p-a-v*clamp(dot(p-a,v)/max(dot(v,v),0.000001),0.0,1.0));
}
// The healing feast breathes three curls of fragrant, gently ascending steam.
vec2 steam(float f,float branch,float t) {
    float x=0.385+branch*0.141;
    float y=0.458-branch*0.009;
    return vec2(x+0.018*sin(f*10.0-t*2.8+branch*2.0)*sin(f*3.141593)
                +0.027*f*sin(t*0.8+branch),y-0.113*f);
}
void main() {
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    vec4 base=texture2D(u_card,v_uv);
    float aa=1.0/max(u_resolution.x,1.0);
    float t=max(0.0,u_time);
    float seed=fract(u_seed*0.173)*6.283185;
    float art=smoothstep(0.140,0.151,p.y)*(1.0-smoothstep(0.540,0.552,p.y));
    art*=smoothstep(0.006,0.018,p.x)*(1.0-smoothstep(0.982,0.995,p.x));
    // Stamina badge and banner remain exact scan pixels.
    art*=1.0-(1.0-smoothstep(0.162,0.180,p.x))*(1.0-smoothstep(0.220,0.235,p.y));
    vec3 col=base.rgb;
    float wisps=0.0;
    float haze=0.0;
    for(int i=0;i<24;i++) {
        float k=float(i);
        float branch=floor(k/8.0);
        float f=mod(k,8.0)/8.0;
        float d=lineDist(p,steam(f,branch,t+seed),steam(f+0.125,branch,t+seed));
        float fade=sin((f+0.05)*2.9);
        float wave=0.28+0.72*pow(0.5+0.5*cos(f*16.0-t*4.6+branch+seed),2.0);
        wisps=max(wisps,(1.0-smoothstep(0.0015,0.0045+aa*0.35,d))*fade*wave);
        haze=max(haze,exp(-d*d/0.00014)*fade*wave);
    }
    col+=(1.0-col)*vec3(0.58,0.83,0.28)*haze*0.37;
    col+=(1.0-col)*vec3(0.91,0.94,0.50)*wisps*0.72;
    // Moving golden motes rise from the fruit and roast: the feast heals for two.
    float motes=0.0;
    for(int i=0;i<9;i++) {
        float k=float(i);
        float branch=floor(k/3.0);
        float f=fract(t*0.31+k*0.327+seed*0.04);
        vec2 q=steam(f,branch,t+seed);
        float d=length((p-q)*vec2(1.0,1.41));
        motes+=(1.0-smoothstep(0.0025,0.006+aa*0.35,d))*sin(f*3.141593);
    }
    col+=vec3(0.90,0.67,0.17)*motes*0.70;
    // Candle flames dance independently at their painted wicks.
    for(int i=0;i<3;i++) {
        float k=float(i);
        vec2 wick=vec2(0.540,0.399);
        if(i==1) wick=vec2(0.802,0.410);
        if(i==2) wick=vec2(0.899,0.438);
        float flicker=0.65+0.35*sin(t*7.3+k*2.2+seed)*sin(t*4.7+k);
        vec2 flame=wick+vec2(0.003*sin(t*6.0+k+seed),-0.014-0.004*flicker);
        float core=oval(p,flame,vec2(0.007+aa*0.25,0.017+0.007*flicker));
        float halo=oval(p,flame,vec2(0.040,0.042));
        col+=(1.0-col)*vec3(1.0,0.38,0.025)*halo*(0.20+0.38*flicker);
        col+=vec3(1.0,0.70,0.18)*core*0.85;
    }
    // Ektor's raised goblet and priestly medallion catch the feast's blessing.
    float cup=oval(p,vec2(0.534,0.282),vec2(0.025,0.024));
    float medal=oval(p,vec2(0.599,0.325),vec2(0.044,0.026));
    float blessing=0.5+0.5*sin(t*2.7+seed);
    col+=(1.0-col)*vec3(0.95,0.71,0.16)*(cup+medal)*(0.16+0.60*blessing);
    if(u_is_foil) {
        float face=oval(p,vec2(0.650,0.270),vec2(0.080,0.070));
        float robe=oval(p,vec2(0.650,0.364),vec2(0.225,0.108));
        float feast=oval(p,vec2(0.555,0.455),vec2(0.405,0.090));
        float finish=(0.25+0.55*robe+0.33*feast)*(1.0-face);
        float field=p.x*2.3+p.y*4.7+0.12*sin(p.x*13.0-p.y*24.0)+seed*0.04+t*0.075;
        vec3 rainbow=0.5+0.5*cos(6.283185*(field+vec3(0.02,0.29,0.61)));
        vec3 metal=mix(2.0*col*rainbow,1.0-2.0*(1.0-col)*(1.0-rainbow),step(vec3(0.5),col));
        col=mix(col,metal,finish*0.65);
        float gleam=pow(0.5+0.5*sin(field*10.0-t),7.0);
        col+=(1.0-col)*mix(vec3(1.0,0.69,0.20),rainbow,0.55)*finish*(0.10+0.27*gleam);
    }
    gl_FragColor=vec4(mix(base.rgb,clamp(col,0.0,1.0),art),base.a);
}
